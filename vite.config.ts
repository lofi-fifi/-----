import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 两种部署目标的路径不一样：
  //   Vercel / 自有域名  -> 根目录，base = '/'
  //   GitHub Pages       -> 子路径 https://<用户名>.github.io/<仓库名>/，
  //                         由 GitHub Actions 注入 VITE_BASE=/<仓库名>/
  const env = loadEnv(mode, '.')
  const base = env.VITE_BASE || '/'

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // 有新版本就自动接管，不用手动点「刷新」
        registerType: 'autoUpdate',

        manifest: {
          name: '考研打卡',
          short_name: '考研打卡',
          description: '每日任务、学习时长、番茄钟与签到打卡',
          lang: 'zh-CN',
          // start_url / scope 必须跟着 base 走，否则装到手机上会打开错误的路径
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait',
          // 极简白底黑字，和 SPEC 的视觉风格一致
          background_color: '#FFFFFF',
          theme_color: '#FFFFFF',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              // Android 自适应图标，会被裁成圆形/方形，所以留了安全边距
              purpose: 'maskable',
            },
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
          ],
        },

        workbox: {
          // 应用本身没有后端，全量预缓存后可以完全离线使用
          globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
          // 下面这些 vite-plugin-pwa 会按 manifest 自动注入，这里排除掉避免重复登记
          globIgnores: ['**/pwa-*.png', '**/icon.svg', '**/manifest.webmanifest'],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
        },

        // dev 下不启用 SW，避免开发时被缓存干扰；
        // 想在本机验证 PWA 请用 `pnpm build && pnpm preview`
        devOptions: { enabled: false },
      }),
    ],
    server: {
      // host: true — 手机连同一 Wi-Fi 可以直接打开局域网地址
      host: true,
      port: 5173,
    },
  }
})
