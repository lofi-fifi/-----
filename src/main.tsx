import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import App from './App.tsx'
import { watchInstallPrompt } from './utils/install'

// 必须在这里注册：beforeinstallprompt 可能在 React 挂载之前就触发，
// 晚一步就永远抓不到，安装按钮也就永远不出现
watchInstallPrompt()

const container = document.getElementById('root')
if (!container) throw new Error('#root 不存在，请检查 index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
