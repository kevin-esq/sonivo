const MAX_IMAGE_INPUT_BYTES = 100 * 1024 * 1024
const MAX_IMAGE_PIXELS = 40_000_000
const QUALITY_LEVELS = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.44]

export class ImageOptimizationError extends Error {
  constructor(readonly reason: 'input-too-large' | 'unsupported' | 'target-unreachable') {
    super(reason)
    this.name = 'ImageOptimizationError'
  }
}

function isSupportedImage(file: File): boolean {
  const mime = file.type.toLowerCase().split(';', 2)[0]?.trim() ?? ''
  return mime === 'image/png'
    || mime === 'image/jpeg'
    || mime === 'image/webp'
    || /\.(png|jpe?g|webp)$/i.test(file.name)
}

async function encodeWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', quality)
  })
  if (!blob || blob.type !== 'image/webp') {
    throw new ImageOptimizationError('unsupported')
  }
  return blob
}

/** Converts an oversized image to WebP without changing its dimensions. */
export async function compressImageToMaxBytes(file: File, maxBytes: number): Promise<File> {
  if (!isSupportedImage(file)) return file
  if (file.size <= maxBytes) return file
  if (file.size > MAX_IMAGE_INPUT_BYTES) {
    throw new ImageOptimizationError('input-too-large')
  }
  if (typeof createImageBitmap !== 'function') {
    throw new ImageOptimizationError('unsupported')
  }

  const bitmap = await createImageBitmap(file)
  try {
    if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
      throw new ImageOptimizationError('unsupported')
    }

    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { alpha: true })
    if (!context) throw new ImageOptimizationError('unsupported')
    context.drawImage(bitmap, 0, 0)

    for (const quality of QUALITY_LEVELS) {
      const blob = await encodeWebp(canvas, quality)
      if (blob.size <= maxBytes) {
        const baseName = file.name.replace(/\.[^.]+$/, '') || 'image'
        return new File([blob], `${baseName}.webp`, {
          type: 'image/webp',
          lastModified: file.lastModified,
        })
      }
    }

    throw new ImageOptimizationError('target-unreachable')
  } finally {
    bitmap.close()
  }
}
