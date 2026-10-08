-- ============================================================
-- 考研打卡 · 第三轮：好友列表 RPC
-- ============================================================
-- 在 Supabase Dashboard → SQL Editor 里整段粘贴执行。
--
-- 要解决的问题：
--   friendships 的 RLS 只让你看到「和自己有关」的行，
--   profiles 的 RLS 只让你看到「自己和已同意的好友」。
--   两者一叠加 → **别人给你发的好友请求，你读不到对方的名字**，
--   因为你们还不是 accepted 好友，profiles 策略不放行。
--   结果就是「有人想加你」但界面上只能显示一串 UUID。
--
-- 解决办法：
--   用 SECURITY DEFINER 函数一次性把「好友关系 + 对方资料」查出来。
--   它以函数属主身份运行、绕过 RLS，但 where 条件锁死了
--   「只能查 user_id 或 friend_id 等于 auth.uid() 的行」，
--   所以它只是把「本来就该给你看的那一行」补齐了对方的名字，
--   不会泄露任何和你无关的人。
-- ============================================================


create or replace function public.list_my_friendships()
returns table (
  id                 uuid,
  status             text,
  created_at         timestamptz,
  dir                text,
  other_id           uuid,
  other_username     text,
  other_streak       integer,
  other_last_checkin date
)
language sql
security definer
stable
set search_path = public
as $$
  select
    f.id,
    f.status,
    f.created_at,
    -- outgoing = 我发起的请求；incoming = 别人发给我的
    case when f.user_id = auth.uid() then 'outgoing' else 'incoming' end,
    p.id,
    p.username,
    p.streak,
    p.last_checkin_date
  from public.friendships f
  join public.profiles p
    on p.id = case when f.user_id = auth.uid() then f.friend_id else f.user_id end
  where f.user_id = auth.uid() or f.friend_id = auth.uid()
  order by f.created_at desc;
$$;

-- 内部函数，不给客户端直接调用的机会
revoke all on function public.list_my_friendships() from public, anon;
grant execute on function public.list_my_friendships() to authenticated;


-- ============================================================
-- 验证
-- ============================================================
-- 跑完执行这段，应该能看到 list_my_friendships 一行：
--
--   select proname, prosecdef as is_security_definer
--   from pg_proc
--   where pronamespace = 'public'::regnamespace
--   order by proname;
--
-- 期望看到 5 个函数，其中 are_friends / find_profile_by_username /
-- handle_new_user / list_my_friendships / recalc_streak 都应该是 true
-- （on_checkin_change 也是 true）。
