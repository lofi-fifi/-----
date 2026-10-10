-- ============================================================
-- 考研打卡 · 第四轮：日记同步
-- ============================================================
-- 在 Supabase Dashboard → SQL Editor 里整段粘贴执行。
--
-- 只加一列，不动任何现有数据，可以放心执行。
--
-- 为什么不新建一张 diaries 表：
--   日记一直是「整体读写」的 —— 不像任务要按行增删、排序、算差异，
--   所以一列 jsonb 比一张表更省事：读写都是一次往返，也不用写新的 RLS 策略。
--   （哪天想让日记支持按行搜索、或者给好友看，再拆表也不迟。）
--
-- 隐私：这一列挂在 user_settings 上，而那张表的 RLS 已经是「只有自己可见」，
--       所以**好友看不到你的日记**，不用额外配置。
-- ============================================================

alter table public.user_settings
  add column if not exists diaries jsonb not null default '[]'::jsonb;


-- ============================================================
-- 验证
-- ============================================================
-- 跑完执行这段，应该能看到 diaries 这一行：
--
--   select column_name, data_type, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'user_settings'
--   order by ordinal_position;
--
-- 期望： diaries | jsonb | '[]'::jsonb
