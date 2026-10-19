/**
 * Dependency-free OpenRouter client (chat, structured JSON, embeddings,
 * transcription) — docs/deployment/llm-stack.md. Jev decisions live in
 * ./decisions.ts and reuse this transport (`postJsonTo`).
 *
 *   OPENROUTER_API_KEY   required (server-only; never logged or echoed in errors)
 *   OPENROUTER_BASE_URL  default https://openrouter.ai/api/v1
 *   OPENROUTER_APP_URL   sent as HTTP-Referer (falls back to NEXT_PUBLIC_APP_URL)
 *
 * `fetch` and `env` are injectable so tests never touch the network.
 */
import type { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"
import {
  DEFAULT_EMBED_DIMS,
  embedModel,
  openRouterApiKey,
  sttModel,
  tierModels,
  type LlmTier,
} from "./models.js"

export const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
export const OPENROUTER_APP_TITLE = "Concord"

export type OpenRouterErrorCode =
  | "unconfigured"
  | "bad_request"
  | "auth"
  | "insufficient_credits"
  | "timeout"
  | "rate_limited"
  | "upstream"
  | "network"
  | "aborted"
  | "invalid_response"
  | "not_found"
  | "payload_too_large"
  | "overloaded"

/** Typed client error. `status` is the HTTP status (null for non-HTTP failures). */
export class OpenRouterError extends Error {
  readonly status: number | null
  readonly code: OpenRouterErrorCode
  constructor(code: OpenRouterErrorCode, message: string, status: number | null = null) {
    super(message)
    this.name = "OpenRouterError"
    this.code = code
    this.status = status
  }
}

export function errorCodeForStatus(status: number): OpenRouterErrorCode {
  if (status === 401 || status === 403) return "auth"
  if (status === 402) return "insufficient_credits"
  if (status === 404) return "not_found"
  if (status === 408 || status === 504) return "timeout"
  if (status === 413) return "payload_too_large"
  if (status === 429) return "rate_limited"
  if (status === 529) return "overloaded"
  if (status >= 500) return "upstream"
  return "bad_request"
}

export type ClientOptions = {
  env?: NodeJS.ProcessEnv
  fetch?: typeof fetch
  /** Explicit key (otherwise OPENROUTER_API_KEY). */
  apiKey?: string
}

export type ResolvedClient = {
  apiKey: string
  baseUrl: string
  appUrl: string | undefined
  fetchImpl: typeof fetch
}

export function resolveClient(options: ClientOptions = {}): ResolvedClient {
  const env = options.env ?? process.env
  const apiKey = options.apiKey?.trim() || openRouterApiKey(env)
  if (!apiKey) {
    throw new OpenRouterError("unconfigured", "OPENROUTER_API_KEY is not set")
  }
  const baseUrl = (env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL).replace(/\/+$/, "")
  const appUrl = env.OPENROUTER_APP_URL?.trim() || env.NEXT_PUBLIC_APP_URL?.trim() || undefined
  return { apiKey, baseUrl, appUrl, fetchImpl: options.fetch ?? fetch }
}

export function openRouterHeaders(client: Pick<ResolvedClient, "apiKey" | "appUrl">): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${client.apiKey}`,
    "Content-Type": "application/json",
    "X-Title": OPENROUTER_APP_TITLE,
  }
  if (client.appUrl) headers["HTTP-Referer"] = client.appUrl
  return headers
}

function redact(text: string, apiKey: string): string {
  return apiKey ? text.split(apiKey).join("[redacted]") : text
}

/** Pull `error.message` out of an OpenRouter error body (JSON or text). */
function errorMessage(bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText) as { error?: { message?: unknown } | string }
    const err = parsed.error
    if (typeof err === "string") return err
    if (err && typeof err.message === "string") return err.message
  } catch {
    // not JSON
  }
  return bodyText
}

async function postJson<T>(
  client: ResolvedClient,
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return postJsonTo<T>(client, `${client.baseUrl}${path}`, path, body, signal)
}

/**
 * POST JSON to an absolute OpenRouter URL (`label` names it in errors). Maps
 * HTTP / network / abort failures to OpenRouterError and redacts the key.
 */
export async function postJsonTo<T>(
  client: ResolvedClient,
  url: string,
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response
  try {
    response = await client.fetchImpl(url, {
      method: "POST",
      headers: openRouterHeaders(client),
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
      throw new OpenRouterError("aborted", `OpenRouter ${path} aborted`)
    }
    const reason = err instanceof Error ? err.message : String(err)
    throw new OpenRouterError("network", redact(`OpenRouter ${path} network error: ${reason}`, client.apiKey))
  }
  const text = await response.text().catch(() => "")
  if (!response.ok) {
    const detail = redact(errorMessage(text), client.apiKey).slice(0, 300)
    throw new OpenRouterError(
      errorCodeForStatus(response.status),
      `OpenRouter ${path} HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      response.status,
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new OpenRouterError("invalid_response", `OpenRouter ${path} returned non-JSON`, response.status)
  }
  // OpenRouter can report upstream failures inside a 200 body.
  const embedded = (parsed as { error?: { message?: unknown; code?: unknown } | string }).error
  if (embedded) {
    const code = typeof embedded === "object" && typeof embedded.code === "number" ? embedded.code : 502
    const message =
      typeof embedded === "string"
        ? embedded
        : typeof embedded.message === "string"
          ? embedded.message
          : "upstream error"
    throw new OpenRouterError(
      errorCodeForStatus(code),
      redact(`OpenRouter ${path} error: ${message}`, client.apiKey).slice(0, 300),
      code,
    )
  }
  return parsed as T
}

/* ------------------------------------------------------------------ */
/* Chat                                                                */
/* ------------------------------------------------------------------ */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

export type ChatUsage = {
  input_tokens: number | null
  output_tokens: number | null
  /** USD, when OpenRouter usage accounting returns it. */
  cost: number | null
}

export type ChatRequest = {
  /** Chat tier (only "small"). Ignored when `model` is set. */
  tier?: LlmTier
  /** Explicit OpenRouter slug; no fallback list is sent. */
  model?: string
  /** Explicit ordered fallback list (overrides `tier` and `model`). */
  models?: string[]
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
  /** Structured output (`response_format: json_schema`, strict). */
  jsonSchema?: { name: string; schema: Record<string, unknown> }
}

export type ChatResult = {
  text: string
  /** Model that actually answered (may be the fallback). */
  model: string
  usage: ChatUsage
}

type ChatCompletionResponse = {
  model?: string
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> | null } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
}

/** Build the /chat/completions body (exported for tests). */
export function buildChatBody(request: ChatRequest, env: NodeJS.ProcessEnv = process.env): Record<string, unknown> {
  const models = request.models?.length
    ? [...new Set(request.models)]
    : request.model
      ? [request.model]
      : tierModels(request.tier ?? "small", env)
  const body: Record<string, unknown> = {
    model: models[0],
    messages: request.messages,
    usage: { include: true },
  }
  if (models.length > 1) body.models = models
  if (request.temperature != null) body.temperature = request.temperature
  if (request.maxTokens != null) body.max_tokens = request.maxTokens
  if (request.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: request.jsonSchema.name, strict: true, schema: request.jsonSchema.schema },
    }
  }
  return body
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text ?? "") : ""))
      .join("")
  }
  return ""
}

export async function chat(request: ChatRequest, options: ClientOptions = {}): Promise<ChatResult> {
  const client = resolveClient(options)
  const body = buildChatBody(request, options.env ?? process.env)
  const response = await postJson<ChatCompletionResponse>(client, "/chat/completions", body, request.signal)
  const choice = response.choices?.[0]
  if (!choice?.message) {
    throw new OpenRouterError("invalid_response", "OpenRouter chat returned no choices")
  }
  return {
    text: messageText(choice.message.content),
    model: response.model ?? String(body.model),
    usage: {
      input_tokens: response.usage?.prompt_tokens ?? null,
      output_tokens: response.usage?.completion_tokens ?? null,
      cost: response.usage?.cost ?? null,
    },
  }
}

/* ------------------------------------------------------------------ */
/* Structured JSON                                                     */
/* ------------------------------------------------------------------ */

/** Drop keywords strict json_schema providers reject (`$schema`, `default`). */
function sanitiseSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitiseSchema)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (key === "$schema" || key === "default") continue
      out[key] = sanitiseSchema(child)
    }
    return out
  }
  return value
}

/** zod → strict-mode JSON Schema (all properties required, no additional props). */
export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const raw = zodToJsonSchema(schema, { target: "openAi", $refStrategy: "none" })
  return sanitiseSchema(raw) as Record<string, unknown>
}

/** Strip ```json fences / prose around the first JSON object or array. */
export function extractJson(text: string): string {
  const trimmed = text.trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  const body = (fenced ? fenced[1]! : trimmed).trim()
  if (body.startsWith("{") || body.startsWith("[")) return body
  const start = body.search(/[[{]/)
  const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"))
  return start >= 0 && end > start ? body.slice(start, end + 1) : body
}

/** Recursively delete null object properties (strict schemas send null for defaulted fields). */
function dropNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNulls)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (child === null) continue
      out[key] = dropNulls(child)
    }
    return out
  }
  return value
}

/** Parse + validate a model reply against `schema` (tolerates fences and nulls for defaulted fields). */
export function parseJsonReply<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, text: string): T {
  let value: unknown
  try {
    value = JSON.parse(extractJson(text))
  } catch {
    throw new OpenRouterError("invalid_response", "Model reply was not valid JSON")
  }
  const first = schema.safeParse(value)
  if (first.success) return first.data
  const second = schema.safeParse(dropNulls(value))
  if (second.success) return second.data
  throw new OpenRouterError(
    "invalid_response",
    `Model reply failed schema validation: ${first.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "(root)"} ${i.message}`)
      .join("; ")}`,
  )
}

export type ChatJsonResult<T> = Omit<ChatResult, "text"> & { object: T; text: string }

/**
 * Structured chat: sends the zod schema as a strict json_schema response
 * format (and restates it in the system prompt for providers that ignore
 * response_format), then parses + validates the reply.
 */
export async function chatJson<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  request: Omit<ChatRequest, "jsonSchema"> & { schemaName?: string },
  options: ClientOptions = {},
): Promise<ChatJsonResult<T>> {
  const jsonSchema = toJsonSchema(schema)
  const instruction = `Reply with only a JSON object matching this JSON Schema (no prose, no code fences): ${JSON.stringify(jsonSchema)}`
  const messages: ChatMessage[] = request.messages.some((m) => m.role === "system")
    ? request.messages.map((m, i) =>
        m.role === "system" && i === request.messages.findIndex((x) => x.role === "system")
          ? { ...m, content: `${m.content}\n\n${instruction}` }
          : m,
      )
    : [{ role: "system", content: instruction }, ...request.messages]
  const { schemaName, ...rest } = request
  const result = await chat(
    { ...rest, messages, jsonSchema: { name: schemaName ?? "response", schema: jsonSchema } },
    options,
  )
  return { ...result, object: parseJsonReply(schema, result.text) }
}

/* ------------------------------------------------------------------ */
/* Embeddings                                                          */
/* ------------------------------------------------------------------ */

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[]; index?: number }>
}

/** POST /embeddings; vectors come back in input order. */
export async function embed(
  texts: string[],
  request: { model?: string; dimensions?: number; signal?: AbortSignal } = {},
  options: ClientOptions = {},
): Promise<number[][]> {
  if (texts.length === 0) return []
  const client = resolveClient(options)
  const model = request.model ?? embedModel(options.env ?? process.env)
  const dimensions = request.dimensions ?? DEFAULT_EMBED_DIMS
  const response = await postJson<EmbeddingResponse>(
    client,
    "/embeddings",
    { model, input: texts, dimensions },
    request.signal,
  )
  const data = response.data ?? []
  if (data.length !== texts.length) {
    throw new OpenRouterError(
      "invalid_response",
      `OpenRouter embeddings returned ${data.length} vectors for ${texts.length} inputs`,
    )
  }
  const ordered = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  return ordered.map((row, i) => {
    const vector = row.embedding
    if (!Array.isArray(vector) || vector.length !== dimensions) {
      throw new OpenRouterError(
        "invalid_response",
        `OpenRouter embedding ${i} has ${Array.isArray(vector) ? vector.length : 0} dims, expected ${dimensions}`,
      )
    }
    return vector
  })
}

/* ------------------------------------------------------------------ */
/* Transcription                                                       */
/* ------------------------------------------------------------------ */

export type TranscribeRequest = {
  /** Base64 audio (no data: prefix). */
  base64: string
  /** Container format, e.g. "webm", "mp3", "wav", "ogg", "m4a". */
  format: string
  model?: string
  language?: string
  signal?: AbortSignal
}

/** POST /audio/transcriptions (JSON body with `input_audio`). */
export async function transcribe(
  request: TranscribeRequest,
  options: ClientOptions = {},
): Promise<{ text: string; model: string }> {
  const client = resolveClient(options)
  const model = request.model ?? sttModel(options.env ?? process.env)
  const body: Record<string, unknown> = {
    model,
    input_audio: { data: request.base64, format: request.format },
  }
  if (request.language) body.language = request.language
  const response = await postJson<{ text?: unknown }>(client, "/audio/transcriptions", body, request.signal)
  if (typeof response.text !== "string") {
    throw new OpenRouterError("invalid_response", "OpenRouter transcription returned no text")
  }
  return { text: response.text, model }
}
