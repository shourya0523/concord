/**
 * Server-side transcription for voice answers (plan 2026-09-23-001 P7.1,
 * OQ-7: Gemini audio input). The model call is injectable so tests never hit
 * the network; without an API key callers get `{ ok: false, reason: "unconfigured" }`
 * and the route answers 501.
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { DEFAULT_RAG_GENERATE_MODEL, googleApiKey } from "@ibpe/ai"
import { generateText } from "ai"

/** 5 MB — ~3 minutes of webm/opus at typical MediaRecorder bitrates is < 2 MB. */
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024
export const MAX_AUDIO_MS = 3 * 60 * 1000
export const TRANSCRIBE_TIMEOUT_MS = 30_000

export const ALLOWED_AUDIO_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
] as const

/** `audio/webm;codecs=opus` → `audio/webm`; null when not an allowed audio type. */
export function normaliseAudioType(type: string | null | undefined): string | null {
  const base = (type ?? "").split(";")[0]!.trim().toLowerCase()
  return (ALLOWED_AUDIO_TYPES as readonly string[]).includes(base) ? base : null
}

export function transcriptionModelId(env: NodeJS.ProcessEnv = process.env): string {
  return env.GRADER_MODEL?.trim() || DEFAULT_RAG_GENERATE_MODEL
}

export type TranscribeGenerate = (input: {
  apiKey: string
  modelId: string
  audio: Uint8Array
  mediaType: string
  abortSignal: AbortSignal
}) => Promise<string>

export const TRANSCRIBE_INSTRUCTIONS =
  "Transcribe this spoken interview answer verbatim in English. Keep filler words (um, uh, like, you know) exactly as spoken. Output only the transcript text with no commentary, labels or timestamps. If there is no intelligible speech, output an empty string."

const defaultGenerate: TranscribeGenerate = async ({
  apiKey,
  modelId,
  audio,
  mediaType,
  abortSignal,
}) => {
  const google = createGoogleGenerativeAI({ apiKey })
  const { text } = await generateText({
    model: google(modelId),
    temperature: 0,
    maxOutputTokens: 1200,
    abortSignal,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: TRANSCRIBE_INSTRUCTIONS },
          { type: "file", data: audio, mediaType },
        ],
      },
    ],
  })
  return text
}

export type TranscribeResult =
  | { ok: true; transcript: string; model: string }
  | { ok: false; reason: "unconfigured" | "failed"; message: string }

/** Strip code fences / "Transcript:" labels some models add. */
export function cleanTranscript(raw: string): string {
  return raw
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/^\s*transcript\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
}

export async function transcribeAudio(
  input: { audio: Uint8Array; mediaType: string },
  deps: { env?: NodeJS.ProcessEnv; generate?: TranscribeGenerate; timeoutMs?: number } = {},
): Promise<TranscribeResult> {
  const env = deps.env ?? process.env
  const apiKey = googleApiKey(env)
  if (!apiKey) {
    return {
      ok: false,
      reason: "unconfigured",
      message: "Voice transcription needs GEMINI_API_KEY — type your answer instead.",
    }
  }
  const modelId = transcriptionModelId(env)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? TRANSCRIBE_TIMEOUT_MS)
  try {
    const text = await (deps.generate ?? defaultGenerate)({
      apiKey,
      modelId,
      audio: input.audio,
      mediaType: input.mediaType,
      abortSignal: controller.signal,
    })
    return { ok: true, transcript: cleanTranscript(text), model: modelId }
  } catch (err) {
    console.warn("[transcribe] Gemini transcription failed", err)
    return {
      ok: false,
      reason: "failed",
      message: controller.signal.aborted
        ? "Transcription timed out — type your answer instead."
        : "Transcription failed — type your answer instead.",
    }
  } finally {
    clearTimeout(timer)
  }
}
