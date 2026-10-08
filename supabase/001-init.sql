-- ============================================================
-- 考研打卡 · 第一轮：基础表结构 + RLS
-- ============================================================
-- 在 Supabase Dashboard → SQL Editor 里整段粘贴执行。
-- 内容和 SUPABASE.md 第三节一致，单独存一份方便重跑 / 重建项目时使用。
--
-- 建了：profiles / friendships / checkins 三张表，
--       注册自动建档触发器，签到自动重算连续天数的触发器，
--       以及全部 RLS 策略和列级授权。
--
-- 后面还有第二轮（任务同步 + 好友可见性），见 002-tasks-and-friends.sql
-- ============================================================
-- ============================================================
-- 考研打卡 · Supabase 初始化
-- 在 Supabase Dashboard → SQL Editor 里整段粘贴执行
-- ============================================================

-- ============================================================
-- 1. profiles：用户资料
-- ============================================================
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  username          text        not null,
  -- 连续签到天数：由触发器维护，用户改不了（见下面的列级授权）
  streak            integer     not null default 0,
  -- 最后一次签到日期：存事实，不存「今天签了吗」的布尔值
  last_checkin_date date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint username_length check (char_length(trim(username)) between 2 and 20)
);

-- 用户名不区分大小写 + 忽略首尾空格，唯一（加好友要用它搜人）
create unique index if not exists profiles_username_key
  on public.profiles (lower(trim(username)));

-- ============================================================
-- 2. friendships：好友关系
-- ============================================================
create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  friend_id    uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'blocked')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  constraint no_self_friend check (user_id <> friend_id)
);

-- 同一对用户只能有一条关系，**不分方向**
-- （否则 A 加了 B、B 又加 A，会变成两条，删的时候删不干净）
create unique index if not exists friendships_pair_key
  on public.friendships (least(user_id, friend_id), greatest(user_id, friend_id));

create index if not exists friendships_user_idx   on public.friendships (user_id);
create index if not exists friendships_friend_idx on public.friendships (friend_id);

-- ============================================================
-- 3. checkins：签到记录（同时也作为打卡数据备份）
-- ============================================================
create table if not exists public.checkins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  date       date not null,
  created_at timestamptz not null default now(),
  -- 同一个人同一天只能签一次
  constraint checkins_one_per_day unique (user_id, date)
);

create index if not exists checkins_user_date_idx
  on public.checkins (user_id, date desc);

-- ============================================================
-- 4. 注册时自动建资料
-- ============================================================
-- 用户名从注册时传的 metadata 里取；被别人占了就自动加数字后缀
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base      text;
  candidate text;
  n         int := 0;
begin
  base := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    split_part(coalesce(new.email, 'user'), '@', 1)
  );
  candidate := base;

  loop
    begin
      insert into public.profiles (id, username) values (new.id, candidate);
      return new;
    exception when unique_violation then
      n := n + 1;
      if n >= 100 then
        raise;
      end if;
      candidate := base || n::text;
    end;
  end loop;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 5. 签到表一变，自动重算连续天数
-- ============================================================
create or replace function public.recalc_streak(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  last_date date;
  run_len   int;
begin
  select max(date) into last_date
  from public.checkins where user_id = target;

  if last_date is null then
    update public.profiles
       set streak = 0, last_checkin_date = null, updated_at = now()
     where id = target;
    return;
  end if;

  -- 「间隔与岛屿」：日期 - 行号 相同，说明落在同一段连续区间里
  select count(*)::int into run_len
  from (
    select date, date - (row_number() over (order by date))::int as grp
    from public.checkins
    where user_id = target
  ) t
  where t.grp = (
    select date - (row_number() over (order by date))::int
    from public.checkins
    where user_id = target
    order by date desc
    limit 1
  );

  update public.profiles
     set streak = run_len, last_checkin_date = last_date, updated_at = now()
   where id = target;
end;
$$;

create or replace function public.on_checkin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    perform public.recalc_streak(old.user_id);
  else
    perform public.recalc_streak(new.user_id);
  end if;
  return null;
end;
$$;

drop trigger if exists checkins_sync_streak on public.checkins;
create trigger checkins_sync_streak
  after insert or update or delete on public.checkins
  for each row execute function public.on_checkin_change();

-- ============================================================
-- 6. 打开行级安全（RLS）
-- ============================================================
alter table public.profiles    enable row level security;
alter table public.friendships enable row level security;
alter table public.checkins    enable row level security;

-- ============================================================
-- 7. 判断「我俩是不是好友」
-- ============================================================
-- ⚠️ 关键：必须是 SECURITY DEFINER
-- 如果这个函数以调用者身份跑，它查 friendships 时又会触发 friendships 的
-- RLS 策略，策略里再调这个函数……Postgres 会直接报
-- 「infinite recursion detected in policy for relation "friendships"」。
-- SECURITY DEFINER 让它以函数属主身份运行，绕过 RLS，切断递归。
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and ( (f.user_id = a and f.friend_id = b)
         or (f.user_id = b and f.friend_id = a) )
  );
$$;

-- ============================================================
-- 8. RLS 策略
-- ============================================================

-- ---------- profiles ----------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using ( id = auth.uid() or public.are_friends(auth.uid(), id) );

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check ( id = auth.uid() );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using ( id = auth.uid() )
  with check ( id = auth.uid() );

-- ---------- friendships ----------
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships
  for select to authenticated
  using ( user_id = auth.uid() or friend_id = auth.uid() );

-- 只能以「自己」的身份发起请求，且新请求必须是 pending
drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
  for insert to authenticated
  with check ( user_id = auth.uid() and status = 'pending' );

drop policy if exists friendships_update on public.friendships;
create policy friendships_update on public.friendships
  for update to authenticated
  using ( user_id = auth.uid() or friend_id = auth.uid() )
  with check ( user_id = auth.uid() or friend_id = auth.uid() );

drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships
  for delete to authenticated
  using ( user_id = auth.uid() or friend_id = auth.uid() );

-- ---------- checkins ----------
-- 只对自己可见。以后想让好友看到你的打卡日历，再加一条策略即可。
drop policy if exists checkins_select on public.checkins;
create policy checkins_select on public.checkins
  for select to authenticated using ( user_id = auth.uid() );

drop policy if exists checkins_insert on public.checkins;
create policy checkins_insert on public.checkins
  for insert to authenticated with check ( user_id = auth.uid() );

drop policy if exists checkins_update on public.checkins;
create policy checkins_update on public.checkins
  for update to authenticated
  using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );

drop policy if exists checkins_delete on public.checkins;
create policy checkins_delete on public.checkins
  for delete to authenticated using ( user_id = auth.uid() );

-- ============================================================
-- 9. 显式授权
-- ============================================================
-- 只授权给 authenticated（已登录用户）；anon（未登录）什么都不给。
-- 这一段不管建项目时「Automatically expose new tables」怎么勾都能跑：
-- 先 revoke 掉可能存在的表级 UPDATE，再按列精确授权。
--
-- ⚠️ RLS 只能控制「哪些行」，控制不了「哪些列」。
--    如果给的是表级 update，用户可以 update profiles set streak = 999，
--    好友看到的数字全是假的。所以 UPDATE 必须按列授权。

-- profiles：能查、能建自己的行、**只能改 username**
-- （streak / last_checkin_date 由触发器以表属主身份写入）
revoke update on public.profiles from authenticated;
grant  select, insert, delete on public.profiles to authenticated;
grant  update (username)      on public.profiles to authenticated;

-- friendships：能查、能发起、**只能改 status / responded_at**
-- （不许把 user_id / friend_id 改成别人，那等于伪造好友关系）
revoke update on public.friendships from authenticated;
grant  select, insert, delete        on public.friendships to authenticated;
grant  update (status, responded_at) on public.friendships to authenticated;

-- checkins：完全归自己（user_id 由 RLS 的 with check 兜住，改不到别人身上）
grant  select, insert, update, delete on public.checkins to authenticated;

-- ============================================================
-- 10. 按用户名找人（加好友用）
-- ============================================================
-- 上面的 profiles 策略只让你看「自己和好友」，
-- 所以你没法直接搜一个陌生人。这个函数只返回 id + username，
-- 不泄露对方的 streak 等资料。
create or replace function public.find_profile_by_username(lookup text)
returns table (id uuid, username text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.username
  from public.profiles p
  where lower(trim(p.username)) = lower(trim(lookup))
  limit 1;
$$;

-- ============================================================
-- 11. 内部函数不允许客户端直接调用
-- ============================================================
revoke all on function public.handle_new_user()            from public, anon, authenticated;
revoke all on function public.recalc_streak(uuid)           from public, anon, authenticated;
revoke all on function public.on_checkin_change()           from public, anon, authenticated;
revoke all on function public.find_profile_by_username(text) from public, anon;
revoke all on function public.are_friends(uuid, uuid)        from public, anon;

grant execute on function public.find_profile_by_username(text) to authenticated;
grant execute on function public.are_friends(uuid, uuid)        to authenticated;
