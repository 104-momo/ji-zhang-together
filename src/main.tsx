import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// 全局错误处理：把错误显示在页面顶部，方便调试
const errorBox = document.createElement('div')
errorBox.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#fee;z-index:99999;padding:8px 16px;font-size:12px;color:#c00;max-height:200px;overflow:auto;display:none;'
document.body.appendChild(errorBox)
function showError(msg: string) {
  errorBox.style.display = 'block'
  errorBox.innerHTML += `<div>${msg}</div>`
  console.error('[全局错误]', msg)
}
window.addEventListener('error', (e) => {
  showError(`Error: ${e.message} @ ${e.filename}:${e.lineno}`)
})
window.addEventListener('unhandledrejection', (e) => {
  showError(`UnhandledRejection: ${e.reason?.message || e.reason}`)
})
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
