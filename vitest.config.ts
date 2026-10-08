import { defineConfig } from 'vitest/config'

/**
 * 测试只跑 src/lib 里的纯逻辑 —— 那里不依赖浏览器 API，所以用 node 环境就够。
 *
 * 单独一份配置（而不是复用 vite.config.ts）是为了不把 VitePWA 插件拉进来：
 * 那些插件在测试环境里没有意义，只会拖慢启动、偶尔还报错。
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
