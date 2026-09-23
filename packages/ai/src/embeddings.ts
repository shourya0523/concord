/**
 * Embedding + RAG helpers on OpenRouter (`LLM_EMBED_MODEL`, 768-d so the
 * pgvector(768) column from migration 033 is unchanged).
 */
import { DEFAULT_EMBED_DIMS, DEFAULT_EMBED_MODEL, embedModel, isLlmConfigured } from "./models.js"
import { embed, type ClientOptions } from "./openrouter.js"

export const DEFAULT_EMBEDDING_MODEL = DEFAULT_EMBED_MODEL
export const DEFAULT_EMBEDDING_DIMS = DEFAULT_EMBED_DIMS

export function isEmbeddingConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return isLlmConfigured(env)
}

/** Embedding model id in use (env override or default). */
export function embeddingModelId(env: NodeJS.ProcessEnv = process.env): string {
  return embedModel(env)
}

type EmbedOptions = ClientOptions & { dimensions?: number; model?: string; signal?: AbortSignal }

export async function embedText(value: string, opts: EmbedOptions = {}): Promise<number[]> {
  const [vector] = await embedTexts([value], opts)
  if (!vector) throw new Error("Embedding request returned no vector")
  return vector
}

export async function embedTexts(values: string[], opts: EmbedOptions = {}): Promise<number[][]> {
  if (values.length === 0) return []
  const { dimensions, model, signal, ...client } = opts
  return embed(
    values,
    {
      model: model ?? embedModel(client.env ?? process.env),
      dimensions: dimensions ?? DEFAULT_EMBEDDING_DIMS,
      signal,
    },
    client,
  )
}

/** Cosine similarity of two equal-length vectors (0 when either is all zeros). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vectors must have the same length (${a.length} vs ${b.length})`)
  }
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!
    const y = b[i]!
    dot += x * y
    na += x * x
    nb += y * y
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** Format a float vector for Neon `vector` column literal. */
export function toPgVectorLiteral(values: number[]): string {
  return `[${values.map((v) => Number(v).toFixed(8)).join(",")}]`
}
