/** Compress/resize image in browser. Returns data URL string (for encryption as text). */
export async function compressImage(file, { maxWidth = 1600, maxBytes = 700 * 1024, quality = 0.82 } = {}) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Not an image')
  }
  const bitmap = await createImageBitmap(file)
  let w = bitmap.width
  let h = bitmap.height
  if (w > maxWidth) {
    h = Math.round((h * maxWidth) / w)
    w = maxWidth
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  let mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  if (file.type === 'image/webp') mime = 'image/webp'

  let q = quality
  let blob = await canvasToBlob(canvas, mime, q)
  while (blob.size > maxBytes && q > 0.4 && mime !== 'image/png') {
    q -= 0.1
    blob = await canvasToBlob(canvas, mime, q)
  }
  if (blob.size > maxBytes) {
    // force jpeg
    mime = 'image/jpeg'
    q = 0.7
    blob = await canvasToBlob(canvas, mime, q)
    while (blob.size > maxBytes && q > 0.35) {
      q -= 0.1
      blob = await canvasToBlob(canvas, mime, q)
    }
  }
  if (blob.size > maxBytes) {
    throw new Error('Image too large after compress')
  }
  const dataUrl = await blobToDataURL(blob)
  return { dataUrl, mime, bytes: blob.size }
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), mime, quality)
  })
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}
