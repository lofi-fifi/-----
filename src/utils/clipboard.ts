/**
 * 复制文本到剪贴板。
 *
 * 优先用 navigator.clipboard —— 但它只在**安全上下文**（https / localhost）才有。
 * 手机通过局域网 IP 访问时是 http://192.168.x.x，拿不到这个 API，
 * 所以必须有 execCommand 的降级路径。
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof document === 'undefined') return false

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 落到下面的降级方案
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    // 不能 display:none，否则 iOS 上选不中
    area.style.position = 'fixed'
    area.style.top = '0'
    area.style.left = '0'
    area.style.opacity = '0'
    area.setAttribute('readonly', '')

    document.body.appendChild(area)
    area.select()
    area.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
