import { env, pipeline } from '@huggingface/transformers'

// The app is deployed as a static site, so text embedding runs on the user's
// device instead of requiring a model server or API key.
env.allowLocalModels = false

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2'
let extractorPromise: ReturnType<typeof pipeline> | null = null

self.onmessage = async (event: MessageEvent<{ id: number; text: string }>) => {
  const { id, text } = event.data
  try {
    if (!extractorPromise) {
      self.postMessage({ type: 'status', status: 'loading' })
      extractorPromise = pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8',
      revision: '751bff37182d3f1213fa05d7196b954e230abad9',
      progress_callback: (progress: { status?: string; file?: string; progress?: number }) => {
        self.postMessage({ type: 'progress', ...progress })
      },
      })
    }

    const extractor = await extractorPromise as any
    const output = await extractor(text, { pooling: 'mean', normalize: true })
    const embedding = Array.from(output.data as Float32Array)
    if (embedding.length !== 384 || embedding.some((value) => !Number.isFinite(value))) {
      throw new Error(`MiniLM returned ${embedding.length} values; VectorScope requires exactly 384.`)
    }

    self.postMessage({ type: 'result', id, embedding })
  } catch (error) {
    extractorPromise = null
    self.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : 'Could not create a text embedding.' })
  }
}
