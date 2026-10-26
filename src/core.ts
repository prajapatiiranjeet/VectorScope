export const REQUIRED_EMBEDDING_DIMENSIONS = 384
export type RecordRow = { id: string; text: string; embedding: number[]; metadata: Record<string, string>; row: number; norm: number }
export type Metric = 'cosine' | 'euclidean' | 'dot'
export type Ranked = { record: RecordRow; score: number; rank: number }
export type Projection = { id: string; x: number; y: number; z: number }
const norm = (v: number[]) => Math.sqrt(v.reduce((sum, x) => sum + x * x, 0))
export const vectorNorm = norm

export function parseVector(value: string): number[] {
  const input = value.trim()
  if (!input) throw new Error('Vector is empty.')
  let values: unknown
  if (input.startsWith('[')) {
    try { values = JSON.parse(input) } catch { throw new Error('Vector is not a valid JSON array.') }
    if (!Array.isArray(values)) throw new Error('Vector must be a JSON array.')
  } else {
    const body = input.replace(/^\(|\)$/g, '')
    const chunks = /[,;]/.test(body) ? body.split(/[,;]/).flatMap((part) => part.trim() ? part.trim().split(/\s+/) : ['']) : body.split(/\s+/)
    if (chunks.some((part) => !part.trim())) throw new Error('Vector contains an empty value.')
    values = chunks
  }
  const vector = (values as unknown[]).map((value) => typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN)
  if (!vector.length || vector.some((value) => !Number.isFinite(value))) throw new Error('Every vector value must be a finite number.')
  return vector
}

export function detectColumns(headers: string[]) {
  const id = headers.find((h) => /^(id|record_id|uuid|key)$/i.test(h)) ?? headers[0] ?? ''
  const text = headers.find((h) => /^(text|content|body|title|description)$/i.test(h)) ?? ''
  const vector = headers.find((h) => /^(embedding|vector|values)$/i.test(h)) ?? ''
  const dims = headers.filter((h) => /^(embedding|vector|dim|feature)[_ -]?\d+$/i.test(h))
  return { id, text, vector, dims }
}

export function parseRows(rows: Record<string, string>[], headers: string[], config: { id: string; text: string; vector: string; dims: string[] }) {
  const issues: string[] = [], records: RecordRow[] = [], ids = new Set<string>()
  if (!config.id) issues.push('Choose an ID column.')
  if (!config.vector && config.dims.length === 0) issues.push('Choose a vector column or one or more embedding dimensions.')
  rows.forEach((source, index) => {
    const rowNumber = index + 2
    if (Object.values(source).every((value) => !String(value ?? '').trim())) return
    const id = String(source[config.id] ?? '').trim()
    if (!id) { issues.push(`Row ${rowNumber}: missing record ID.`); return }
    if (ids.has(id)) { issues.push(`Row ${rowNumber}: duplicate ID "${id}".`); return }
    ids.add(id)
    let embedding: number[]
    try { embedding = config.vector ? parseVector(String(source[config.vector] ?? '')) : config.dims.map((key) => String(source[key] ?? '').trim() ? Number(source[key]) : Number.NaN) }
    catch (error) { issues.push(`Row ${rowNumber}: ${(error as Error).message}`); return }
    if (!embedding.length || embedding.some((n) => !Number.isFinite(n))) { issues.push(`Row ${rowNumber}: embedding contains a missing, non-numeric, or non-finite value.`); return }
    if (embedding.length !== REQUIRED_EMBEDDING_DIMENSIONS) { issues.push(`Row ${rowNumber}: expected exactly ${REQUIRED_EMBEDDING_DIMENSIONS} dimensions but found ${embedding.length}.`); return }
    if (records.length && embedding.length !== records[0].embedding.length) { issues.push(`Row ${rowNumber}: expected ${records[0].embedding.length} dimensions but found ${embedding.length}.`); return }
    const metadata = Object.fromEntries(headers.filter((h) => h !== config.id && h !== config.text && h !== config.vector && !config.dims.includes(h)).map((h) => [h, String(source[h] ?? '')]))
    records.push({ id, text: String(source[config.text] ?? ''), embedding, metadata, row: rowNumber, norm: norm(embedding) })
  })
  return { records, issues }
}
function dot(a: number[], b: number[]) { return a.reduce((sum, x, i) => sum + x * b[i], 0) }
export function compare(a: number[], b: number[], metric: Metric): number {
  if (a.length !== b.length) throw new Error(`Dimension mismatch: expected ${a.length}, got ${b.length}.`)
  if (metric === 'dot') return dot(a, b)
  if (metric === 'euclidean') return Math.sqrt(a.reduce((sum, x, i) => sum + (x - b[i]) ** 2, 0))
  const denominator = norm(a) * norm(b)
  if (denominator === 0) throw new Error('Cosine similarity is undefined for a zero vector.')
  return dot(a, b) / denominator
}
export function search(records: RecordRow[], query: number[], metric: Metric, topK: number, threshold: number, excludeId?: string, category?: string, categoryField = 'category') {
  if (!records.length) return []
  if (query.length !== records[0].embedding.length) throw new Error(`Query has ${query.length} dimensions; this dataset requires ${records[0].embedding.length}.`)
  const ranked = records.filter((record) => record.id !== excludeId && (!category || record.metadata[categoryField] === category)).flatMap((record) => { try { const score = compare(record.embedding, query, metric); return Number.isFinite(score) ? [{ record, score }] : [] } catch { return [] } })
  const passing = ranked.filter(({ score }) => metric === 'euclidean' ? score <= threshold : score >= threshold)
  passing.sort((a, b) => metric === 'euclidean' ? a.score - b.score : b.score - a.score)
  return passing.slice(0, topK).map((result, index) => ({ ...result, rank: index + 1 }))
}

// Deterministic centered power iteration computes a real PCA basis and projection.
export function projectPca(records: RecordRow[]): Projection[] {
  const n = records.length
  if (!n) return []
  const d = records[0].embedding.length
  if (d === 1) { const mean = records.reduce((sum, r) => sum + r.embedding[0], 0) / n; return records.map((r) => ({ id: r.id, x: r.embedding[0] - mean, y: 0, z: 0 })) }
  const mean = Array.from({ length: d }, (_, j) => records.reduce((s, r) => s + r.embedding[j], 0) / n)
  const centered = records.map((r) => r.embedding.map((x, j) => x - mean[j]))
  const components: number[][] = []
  for (let c = 0; c < Math.min(3, d); c++) {
    let v = Array.from({ length: d }, (_, j) => Math.sin((j + 1) * (c + 1) * 12.9898) + Math.cos((j + 2) * (c + 1) * 4.1414))
    let length = norm(v); v = v.map((x) => x / length)
    for (let iter = 0; iter < 24; iter++) {
      const scores = centered.map((row) => dot(row, v))
      const cv = Array.from({ length: d }, (_, j) => centered.reduce((s, row, i) => s + row[j] * scores[i], 0))
      for (const prior of components) { const coeff = dot(cv, prior); for (let j = 0; j < d; j++) cv[j] -= coeff * prior[j] }
      length = norm(cv)
      if (length < 1e-12) break
      v = cv.map((x) => x / length)
    }
    components.push(v)
  }
  return records.map((record, i) => {
    const values = components.map((component) => dot(centered[i], component))
    return { id: record.id, x: values[0] ?? 0, y: values[1] ?? 0, z: values[2] ?? 0 }
  })
}
export function nearestEdges(records: RecordRow[], metric: Metric, k: number) {
  const edges: { source: string; target: string; score: number }[] = [], seen = new Set<string>()
  records.forEach((record) => {
    records.filter((other) => other.id !== record.id).flatMap((other) => { try { return [{ other, score: compare(record.embedding, other.embedding, metric) }] } catch { return [] } })
      .sort((a, b) => metric === 'euclidean' ? a.score - b.score : b.score - a.score).slice(0, k).forEach(({ other, score }) => {
        const [source, target] = [record.id, other.id].sort(), key = `${source}\u0000${target}`
        if (!seen.has(key)) { seen.add(key); edges.push({ source, target, score }) }
      })
  })
  return edges
}
export function csvEscape(value: unknown) { return `"${String(value ?? '').replaceAll('"', '""')}"` }








