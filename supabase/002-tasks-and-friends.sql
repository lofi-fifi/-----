-- ============================================================
-- 考研打卡 · 第二轮：任务同步 + 好友可见性
-- ============================================================
-- 在 Supabase Dashboard → SQL Editor 里整段粘贴执行。
--
-- 为什么需要这一轮：
--   1. 你要求「好友能看到任务完成情况」—— 但第一轮没有任务表
--   2. 你要求「断网联网后自动上传」—— 任务也得能同步到云端
--   3. 你要求「登录时用云端覆盖本地」—— 那云端必须存着**全部**数据，
--      不然覆盖之后你本地的任务、设置、徽章就全没了
--
-- 这一段是**纯新增 + 替换策略**，不会动已有数据，可以放心执行。
-- ============================================================


-- ============================================================
-- 1. tasks：任务
-- ============================================================
-- 同时承担两件事：
--   · 跨设备同步（手机记的任务，电脑上也能看到）
--   · 好友监督（好友能看你的任务和完成情况）
--
-- ⚠️ 主键用**客户端生成的 UUID**（就是应用里 crypto.randomUUID() 那个）。
--    离线时在你手机上创建的任务，联网后直接 upsert 上去，
--    重传多少次都不会插出重复行 —— 这是离线同步能对的关键。
create table if not exists public.tasks (
  id         uuid primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  date       date not null,
  text       text not null,
  done       boolean not null default false,
  seconds    integer not null default 0,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_date_idx on public.tasks (user_id, date);
create index if not exists tasks_updated_idx   on public.tasks (updated_at);


-- ============================================================
-- 2. user_settings：私有数据（好友看不到）
-- ============================================================
-- 设置、徽章、未关联任务的累计时长。
-- 单独一张表是为了**和 profiles 分开**：
--   profiles 好友可读（需要看用户名和连续天数），
--   而设置里有你的自定义语录、考试日期这些东西，不该给好友看。
-- RLS 只能按「行」授权，不能按「列」区分好友和自己，
-- 所以必须拆表。
create table if not exists public.user_settings (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  settings   jsonb not null default '{}'::jsonb,
  badges     jsonb not null default '[]'::jsonb,
  day_totals jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);


-- ============================================================
-- 3. 打开 RLS
-- ============================================================
alter table public.tasks         enable row level security;
alter table public.user_settings enable row level security;


-- ============================================================
-- 4. tasks 策略：自己全权，好友只读
-- ============================================================
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using ( user_id = auth.uid() or public.are_friends(auth.uid(), user_id) );

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated with check ( user_id = auth.uid() );

-- using 管「哪些行能改」，with check 管「改完必须还是自己的」
-- 两者合起来保证：改不了别人的任务，也不能把自己的任务「过户」给别人
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated using ( user_id = auth.uid() );


-- ============================================================
-- 5. user_settings 策略：只有自己，好友一律看不到
-- ============================================================
drop policy if exists user_settings_select on public.user_settings;
create policy user_settings_select on public.user_settings
  for select to authenticated using ( user_id = auth.uid() );

drop policy if exists user_settings_insert on public.user_settings;
create policy user_settings_insert on public.user_settings
  for insert to authenticated with check ( user_id = auth.uid() );

drop policy if exists user_settings_update on public.user_settings;
create policy user_settings_update on public.user_settings
  for update to authenticated
  using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );

drop policy if exists user_settings_delete on public.user_settings;
create policy user_settings_delete on public.user_settings
  for delete to authenticated using ( user_id = auth.uid() );


-- ============================================================
-- 6. checkins 策略：改成「好友也能看签到情况」
-- ============================================================
-- 第一轮写的是「只有自己可见」。你现在要好友能看到签到情况，所以替换掉。
drop policy if exists checkins_select on public.checkins;
create policy checkins_select on public.checkins
  for select to authenticated
  using ( user_id = auth.uid() or public.are_friends(auth.uid(), user_id) );

-- 增删改仍然只有自己能做（策略没动，保持第一轮的定义）


-- ============================================================
-- 7. 授权
-- ============================================================
-- 只给 authenticated（已登录用户），anon（未登录）什么都不给。
grant select, insert, update, delete on public.tasks         to authenticated;
grant select, insert, update, delete on public.user_settings to authenticated;


-- ============================================================
-- 8. 验证
-- ============================================================
-- 跑完执行下面这段，应该看到 5 张表、全部 rls_enabled = true
--
--   select tablename, rowsecurity as rls_enabled
--   from pg_tables where schemaname = 'public' order by tablename;
--
-- 以及策略数量：
--   checkins 4 / friendships 4 / profiles 3 / tasks 4 / user_settings 4
--
--   select tablename, count(*) from pg_policies
--   where schemaname = 'public' group by tablename order by tablename;
