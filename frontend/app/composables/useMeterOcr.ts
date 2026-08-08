import { createWorker } from 'tesseract.js'

let workerPromise: ReturnType<typeof createWorker> | null = null

// Callbacks registered by in-flight `recognize` calls. Scans can run
// concurrently (electric + water photos), so each caller gets its own slot
// instead of a single shared callback.
const statusCallbacks = new Set<(status: string) => void>()

const getWorker = () => {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr/core',
      langPath: '/ocr/lang',
      gzip: false,
      logger: (message: { status?: string }) => {
        if (message?.status) {
          for (const callback of statusCallbacks) callback(message.status)
        }
      }
    })
  }
  return workerPromise
}

export const useMeterOcr = () => {
  const recognize = async (image: File | Blob | string, onStatus?: (status: string) => void) => {
    const callback = onStatus ?? null
    if (callback) statusCallbacks.add(callback)
    try {
      const worker = await getWorker()
      const { data } = await worker.recognize(image, {
        tessedit_char_whitelist: '0123456789.'
      })
      return data.text
    } finally {
      if (callback) statusCallbacks.delete(callback)
    }
  }

  const extractReading = (text: string): number | null => {
    const matches = [...text.matchAll(/\d+(?:[.,]\d+)?/g)]
      .map(match => ({ value: parseFloat(match[0].replace(',', '.')), index: match.index ?? 0 }))
      .filter(match => Number.isFinite(match.value))
    if (matches.length === 0) return null

    const integerDigits = (value: number) => Math.trunc(value).toString().length
    matches.sort((a, b) => (integerDigits(b.value) - integerDigits(a.value)) || (b.value - a.value) || (b.index - a.index))
    return Math.round(matches[0].value * 1000) / 1000
  }

  return { recognize, extractReading }
}
