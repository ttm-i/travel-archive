export interface ProcessedImage {
  imageBlob: Blob
  thumbnailBlob: Blob
  mimeType: string
  width: number
  height: number
  sourceName: string
}

const MAIN_MAX = 2048
const THUMB_MAX = 480

export async function processImageFile(file: File): Promise<ProcessedImage> {
  if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選んでください')
  const source = await loadImage(file)
  try {
    const mainSize = contain(source.width, source.height, MAIN_MAX)
    const thumbSize = contain(source.width, source.height, THUMB_MAX)
    const imageBlob = await renderJpeg(source.drawable, mainSize.width, mainSize.height, 0.82)
    const thumbnailBlob = await renderJpeg(source.drawable, thumbSize.width, thumbSize.height, 0.74)
    return { imageBlob, thumbnailBlob, mimeType: 'image/jpeg', width: mainSize.width, height: mainSize.height, sourceName: file.name }
  } finally {
    source.close()
  }
}

export function contain(width: number, height: number, maximum: number) {
  const scale = Math.min(1, maximum / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

async function loadImage(file: File): Promise<{ drawable: CanvasImageSource; width: number; height: number; close: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { drawable: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch {
      // Safari versions vary in HEIC/createImageBitmap support; the HTML image path is the fallback.
    }
  }
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.decoding = 'async'
  image.src = url
  try {
    await image.decode()
    return { drawable: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    throw new Error('この写真を読み込めませんでした。JPEGまたはPNGでお試しください')
  }
}

function renderJpeg(source: CanvasImageSource, width: number, height: number, quality: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('写真を処理できませんでした')
  context.drawImage(source, 0, 0, width, height)
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('写真を圧縮できませんでした')), 'image/jpeg', quality))
}

