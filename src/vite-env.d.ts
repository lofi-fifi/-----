/// <reference types="vite/client" />

/** .env.local 里会注入的变量。全部可选 —— 缺了应用要能优雅退化。 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** GitHub Pages 部署时的子路径前缀，例如 /kaoyan/ */
  readonly VITE_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
