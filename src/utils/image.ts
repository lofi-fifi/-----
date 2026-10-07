/**
 * 图片处理：上传的背景图在前端压缩成 Base64，避免直接塞原图把 localStorage 撑爆。
 */

/** 压缩后最长边的上限 */
export const MAX_IMAGE_EDGE = 1920

/** JPEG 质量 */
export const IMAGE_QUALITY = 0.7

type Drawable = ImageBitmap | HTMLImageElement

function loadViaImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片解码失败'))
    }
    image.src = url
  })
}

async function loadDrawable(file: File): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    try {
      // from-image：按 EXIF 方向摆正，手机竖着拍的照片才不会躺倒
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // 个别浏览器不认这个选项，退回 <img> 方案
    }
  }
  return loadViaImageElement(file)
}

/**
 * 把图片压缩成 JPEG 的 Base64 data URL。
 * 最长边不超过 1920px，质量 0.7。
 */
export async function compressImage(
  file: File,
  maxEdge: number = MAX_IMAGE_EDGE,
  quality: number = IMAGE_QUALITY,
): Promise<string> {
  const drawable = await loadDrawable(file)

  const sourceWidth = drawable.width
  const sourceHeight = drawable.height
  if (!sourceWidth || !sourceHeight) throw new Error('图片尺寸异常')

  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 canvas 上下文')

  // 先铺一层白底：带透明通道的 PNG 转成 JPEG 后，透明区不会变成黑色
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(drawable, 0, 0, width, height)

  if ('close' in drawable && typeof drawable.close === 'function') {
    drawable.close()
  }

  return canvas.toDataURL('image/jpeg', quality)
}
