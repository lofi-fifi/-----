# Supabase 配置指南（保姆级）

目标：注册 Supabase、建好三张表、配好行级安全策略（RLS），为后续的「账号登录 + 加好友互相监督」打地基。

**这一步只配云端，不动任何前端代码。**

---

## 📁 仓库里的 SQL 文件

配置过程中的 SQL 都单独存了一份，方便重跑或重建项目：

| 文件 | 内容 | 状态 |
|---|---|---|
| [`supabase/001-init.sql`](supabase/001-init.sql) | 第一轮：`profiles` / `friendships` / `checkins` + 触发器 + RLS | ✅ 已执行 |
| [`supabase/002-tasks-and-friends.sql`](supabase/002-tasks-and-friends.sql) | 第二轮：`tasks` / `user_settings` + 好友可见性调整 | ⬜ 待执行 |

下面第三节贴的是**第一轮**的完整内容（和 001 一致）。

---

## 零、先认清两套 API key

Supabase 现在有**两套 key**，长得完全不一样，先认清再往下走：

| 类型 | 长什么样 | 能放前端吗 |
|---|---|---|
| **Publishable key**（新） | `sb_publishable_xxxxxxxx...` | ✅ **可以**，它本来就是公开的 |
| **Secret key**（新） | `sb_secret_xxxxxxxx...` | ❌ **绝对不行**，绕过所有 RLS |
| **anon**（旧 · legacy） | `eyJhbGciOi...` 一大串 JWT | ✅ 可以，作用等同于 publishable |
| **service_role**（旧 · legacy） | `eyJhbGciOi...` 一大串 JWT | ❌ 绝对不行 |

**记住一句话**：名字里带 `secret` 或 `service_role` 的，**永远不要写进前端代码**。
它们绕过全部 RLS，等于数据库的万能钥匙 —— 泄露 = 别人可以删光你的数据。

| 铁律 | 说明 |
|---|---|
| ✅ publishable / anon 可以放前端 | 靠 RLS 保护数据，本来就是设计成公开的 |
| ❌ secret / service_role 绝对不能进前端 | 绕过全部 RLS |
| ✅ 免费版完全够用 | 500MB 数据库 / 50,000 月活，你一个人 + 几个好友用不到零头 |

---
## 零点五、创建项目时那三个复选框怎么选

建项目时会看到一个 **Security** 区块，三个选项：

| 选项 | 怎么选 | 为什么 |
|---|---|---|
| **Enable Data API** | ✅ **保持勾选** | `supabase-js` 就是通过它生成的 REST API 访问数据库的，不勾前端连不上 |
| **Automatically expose new tables** | ☐ **取消勾选** | Supabase 自己的建议（*"We recommend disabling this to control access manually"*）。不勾的话新建表默认谁都不能访问，必须手动授权，更安全 |
| **Enable automatic RLS** | ✅ **勾选** | 给所有新建表自动开 RLS，多一层保险，防止以后建了表忘了开 |

> **不用担心选错**：第 3 节 SQL 的第 9 段是**显式授权** ——
> 先 `revoke` 掉可能存在的表级权限，再按列精确 `grant`，
> 所以**第二个选项勾不勾都能正常跑**。按建议取消勾选即可。

---

## 一、注册并创建项目

### 1. 注册

1. 打开 **https://supabase.com**
2. 右上角 **`Start your project`**
3. 选 **`Continue with GitHub`** —— 用你已有的 `lofi-fifi` 账号登录，最省事
4. 授权

### 2. 创建项目

登录后会进控制台，点 **`New project`**，填四个东西：

| 字段 | 填什么 |
|---|---|
| **Organization** | 保持默认（自动给你建了一个） |
| **Name** | `kaoyan` |
| **Database Password** | 点右边的 **`Generate a password`**，然后**复制下来存好**（比如存到微信收藏）。⚠️ 这个密码只显示这一次 |
| **Region** | **`Southeast Asia (Singapore)`** ← 中国大陆访问最快的节点 |
| **Pricing Plan** | **Free** |

点 **`Create new project`**，等 **1~3 分钟**（显示 `Setting up project...`）。

### 3. 拿两个值

#### ① Project URL

左侧边栏最底下 **`Project Settings`**（齿轮）→ **`Data API`**，
上面的 **`API URL`** 显示的是：

```
https://xxxxxxxxxxxx.supabase.co/rest/v1/
```

⚠️ **要去掉结尾的 `/rest/v1/`**。`createClient()` 要的是项目根地址：

```
https://xxxxxxxxxxxx.supabase.co
```

#### ② API key

**`Project Settings`** → **`API Keys`**（新版控制台侧边栏也可能直接有 `API Keys` 一项）。

页面顶部有两个标签页：

- **`Publishable and secret API keys`** ← 新版，默认停在这个
- **`Legacy anon, service_role API keys`** ← 旧版

**用新版就行。** 在 **`Publishable key`** 那一段，点 key 右边的**复制按钮**，拿到一长串：

```
sb_publishable_FgSSjoqtDDRE7JXW0fFftA_...
```

> **万一后面连不上**（比如报 `Invalid API key`），切到 **`Legacy anon, service_role API keys`** 标签，
> 复制 **`anon` `public`** 那个 `eyJ...` 开头的 key 换上，效果完全一样。

**⚠️ 千万不要复制同一页 `Secret keys` 里的 `sb_secret_...`（或 legacy 的 `service_role`）。**

> 这两个值下一步写代码时会用，**现在不用发给我**，你自己存好就行。
> `Project URL` 和 publishable key 本来就会出现在前端代码里（浏览器能看到的），不算秘密；
> 真正要保密的是 **`secret` / `service_role` key** 和**数据库密码**。

---
## 二、表结构设计

### 我改了你方案里的两个地方，先说明原因

#### 改动 1：`今日是否已签到`(布尔值) → `last_checkin_date`(日期)

存布尔值会有个**致命问题**：**过了零点它就错了**。

今天你签到，`checked_today = true` 存进数据库。到了明天凌晨，这个 `true` **不会自己变回 false** —— 但界面上它还显示着「已签到」，你就签不了到了。

改成存**最后一次签到的日期**，让客户端判断：

```
今天签到过吗？ = (last_checkin_date == 我本地的今天)
```

日期是**客观事实**，永远不会过期。而且这样还能绕开时区问题（后面讲）。

#### 改动 2：`streak` 由触发器自动维护

连续天数是从 `checkins` 算出来的**派生数据**。如果你让客户端签到后顺便 `update profiles set streak = 5`，会有两个问题：

1. **两次写入不是原子的** —— 签到成功但更新 streak 失败，两边就不一致了
2. **客户端可以撒谎** —— 既然要「互相监督」，好友看到的数字得是真的

所以改成：**签到表一有变化，数据库自动重算**。客户端只管往 `checkins` 插一行。

#### 额外加的：唯一索引

- 用户名不区分大小写唯一（不然加好友会找到两个人）
- 一对好友只能有一条关系（防止 A→B 和 B→A 同时存在，删的时候删不干净）
- 同一个人同一天只能签到一次

### 关于时区（重要）

Supabase 服务器的时区是 **UTC**。如果让服务器算「今天」，那么北京时间早上 8 点之前都算成「昨天」—— 你凌晨 1 点签的到会记在前一天上。

所以设计成：**日期由客户端按本地时区算好，作为字符串传上来**，服务器只负责存和比较。这和你应用现在 `lib/date.ts` 里的做法一致（本地时区 `YYYY-MM-DD`，不用 `toISOString`）。

---

## 三、建表 SQL

打开左侧 **`SQL Editor`** → **`New query`** → **把下面**整段**粘进去 → 点右下角 `Run`**（或按 `Ctrl + Enter`）。

应该显示 `Success. No rows returned`。

```sql
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
```

---

## 四、顺手配好认证（不然下一步会卡）

左侧菜单 **`Authentication`**：

### 1. 关掉邮箱验证（测试期强烈建议）

**`Sign In / Providers`** → **`Email`** → 找到 **`Confirm email`** → **关掉** → `Save`。

不关的话，你每注册一个测试账号都要去邮箱点确认链接，非常烦。**上线前再打开。**

### 2. 加上允许的回调地址

**`URL Configuration`** →

- **`Site URL`** 填你的线上地址：

  ```
  https://lofi-fifi.github.io/你的仓库名/
  ```

- **`Redirect URLs`** 加上（一行一条）：

  ```
  https://lofi-fifi.github.io/你的仓库名/**
  http://localhost:5173/**
  ```

不加的话，登录后跳转会报 `redirect_uri is not allowed`。

> ⚠️ Supabase 的控制台改版比较频繁，上面的菜单路径可能和你的界面差一点。**找不到就截图问我。**

---

## 五、怎么确认配好了

### 1. 表建好了吗

左侧 **`Table Editor`** → 应该能看到 **`profiles`**、**`friendships`**、**`checkins`** 三张表。

### 2. RLS 开了吗

在 **`SQL Editor`** 里跑这段：

```sql
select tablename, rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
order by tablename;
```

三张表的 `rls_enabled` **都必须是 `true`**。

### 3. 策略数量对吗

```sql
select tablename, count(*) as policy_count
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;
```

应该是：

| tablename | policy_count |
|---|---|
| checkins | 4 |
| friendships | 4 |
| profiles | 3 |

### 4. 触发器在吗

```sql
select trigger_name, event_object_table
from information_schema.triggers
where trigger_schema = 'public' or event_object_schema = 'public'
order by event_object_table, trigger_name;
```

应该能看到 **`checkins_sync_streak`**（挂在 checkins 上）。

### 5. 还没人注册

**`Authentication` → `Users`** 应该是**空的**（我们还没写前端）。

---

## 六、配好之后告诉我这些

| 项 | 是/否 |
|---|---|
| Supabase 项目建好了 | |
| 拿到 `Project URL` 和 `anon` key 了 | |
| 上面那段 SQL 执行成功（`Success. No rows returned`） | |
| 三张表在 Table Editor 里能看到 | |
| 验证查询里 `rls_enabled` 三张表**全是 true** | |
| 策略数量是 3 / 4 / 4 | |
| `Confirm email` 关掉了 | |
| `Site URL` 和 `Redirect URLs` 填了 | |

**❌ 不用把 `Project URL`、`anon` key 或者数据库密码发给我。** 下一步写代码时放进 `.env.local` 就行，那个文件已经被 `.gitignore` 挡着了。

**❌❌ 任何时候都不要把 `service_role` key 发给我，也不要写进任何前端代码。**

---

## 七、动手之前，有三个问题先想想（不用现在答）

加云端会改变这个应用的**根本形态**，有三个问题绕不开：

### 1. 离线怎么办？

现在是**离线优先**的 PWA —— 断网也能记任务、能签到，数据在本地。加了云端之后，**地铁上断网时点的签到怎么办？**

我的建议：**本地照样写，同时打一个「待上传」标记，联网后自动补传**（业界叫 offline-first + 后台同步）。这比「断网就不能用」体验好得多，但代码量也大。

### 2. 本地数据和云端数据怎么合并？

你现在手机和电脑**各自有一份 localStorage**。第一次登录时：

- 本地有一堆数据，云端是空的 → 直接把本地上传上去？
- 本地有数据，云端也有（比如你换手机登录）→ 谁的为准？按时间戳合并？

我的建议：**首次登录时问用户一次**（「上传本地数据」还是「使用云端数据覆盖本地」），之后以云端为准、本地做缓存。

### 3. 好友到底能看到什么？

现在设计的是：**能看到你的 `username`、`streak`、`last_checkin_date`**（也就是「连续 12 天，今天已签到」）。

**看不到**你的任务内容、学习时长、具体哪天签的（`checkins` 表只有自己可见）。

如果你想让好友看到更多（比如打卡日历、今天学了多久），那是另一套 RLS 策略，告诉我我再加。

---

## 八、下一步我们会做什么（供你有个预期）

1. 装 `@supabase/supabase-js`，把 URL / anon key 放进 `.env.local`
2. 加登录 / 注册界面（邮箱 + 密码 + 用户名）
3. 把本地 `checkins` 双向同步到云端
4. 加好友界面：搜用户名 → 发请求 → 同意 / 拒绝 → 好友列表
5. 好友详情页：显示对方的连续天数和今日签到状态

**每一步都会先验证再往下走，不会一次性堆上去。**

---

## 九、部署到 GitHub Pages 必须配的 Secrets

**这一步不做的话，线上版本会退化成纯本地版，登录功能整个消失。**

原因：`.env.local` 被 `.gitignore` 挡着，不会上传到 GitHub。
GitHub Actions 在云端构建时拿不到这两个值，`isSupabaseConfigured` 就是 `false`。

### 怎么配

1. 打开你的仓库页面 → **`Settings`**
2. 左侧 **`Secrets and variables`** → **`Actions`**
3. 点 **`New repository secret`**，加两条：

   | Name | Secret |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://xkosgojixemzslujaazl.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | 你的 `sb_publishable_...` 那一整串 |

4. 加完 `.github/workflows/deploy.yml` 里的 `${{ secrets.XXX }}` 就能取到值了

> 配完 Secret 之后**要重新触发一次部署**才生效：
> 随便改点什么推一次，或者去 `Actions` 页面点 **`Deploy to GitHub Pages`** → **`Run workflow`**。

> 用 Secret 而不是 Variable，是为了不让人从 Actions 日志里直接读到。
> 但说实话 publishable key 本来就是公开的（它必然出现在前端产物里），
> **真正绝对不能泄露的是 `sb_secret_` / `service_role` —— 那个永远不要配到任何地方去。**

### 怎么确认线上版本生效了

部署完成后，手机打开应用：

- **能正常用** → 说明变量配好了
- **看不到登录页，直接进了主界面** → 变量没配到，或者配完没重新部署

在浏览器里按 `F12` → `Console` 跑一句也能确认：

```js
fetch('/kaoyan/manifest.webmanifest')  // 或者直接看 Network 里有没有请求 supabase.co
```
