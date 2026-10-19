/**
 * Server-side transcription for voice answers (plan 2026-09-23-001 P7.1):
 * OpenRouter `/audio/transcriptions` with `LLM_STT_MODEL` (default
 * openai/whisper-large-v3-turbo). The model call is injectable so tests never
 * hit the network; without OPENROUTER_API_KEY callers get
 * `{ ok: false, reason: "unconfigured" }` and the route answers 501.
 *
 * The recorder sends webm/opus and we pass format "webm" as-is. Whether the
 * routed STT provider accepts webm is the provider's concern: a rejection
 * surfaces as `reason: "failed"` (route → 502) and the learner types instead.
 * Whisper-class models tend to drop filler words, so delivery filler counts
 * (lib/voice/delivery.ts) can read lower than with the old Gemini prompt.
 */
import { isLlmConfigured, sttModel, transcribe } from "@ibpe/ai"

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

/** Container format name OpenRouter expects in `input_audio.format`. */
export function audioFormat(mediaType: string): string {
  switch (mediaType) {
    case "audio/mpeg":
      return "mp3"
    case "audio/x-wav":
      return "wav"
    case "audio/mp4":
      return "m4a"
    default:
      return mediaType.replace(/^audio\//, "")
  }
}

export function transcriptionModelId(env: NodeJS.ProcessEnv = process.env): string {
  return sttModel(env)
}

export type TranscribeGenerate = (input: {
  env: NodeJS.ProcessEnv
  modelId: string
  audio: Uint8Array
  mediaType: string
  abortSignal: AbortSignal
  /** Test seam for the default OpenRouter call. */
  fetch?: typeof fetch
}) => Promise<string>

const defaultGenerate: TranscribeGenerate = async ({ env, modelId, audio, mediaType, abortSignal, fetch }) => {
  const { text } = await transcribe(
    {
      base64: Buffer.from(audio).toString("base64"),
      format: audioFormat(mediaType),
      model: modelId,
      language: "en",
      signal: abortSignal,
    },
    { env, fetch },
  )
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
  deps: {
    env?: NodeJS.ProcessEnv
    generate?: TranscribeGenerate
    timeoutMs?: number
    fetch?: typeof fetch
  } = {},
): Promise<TranscribeResult> {
  const env = deps.env ?? process.env
  if (!isLlmConfigured(env)) {
    return {
      ok: false,
      reason: "unconfigured",
      message: "Voice transcription isn't configured — type your answer instead.",
    }
  }
  const modelId = transcriptionModelId(env)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? TRANSCRIBE_TIMEOUT_MS)
  try {
    const text = await (deps.generate ?? defaultGenerate)({
      env,
      modelId,
      audio: input.audio,
      mediaType: input.mediaType,
      abortSignal: controller.signal,
      fetch: deps.fetch,
    })
    return { ok: true, transcript: cleanTranscript(text), model: modelId }
  } catch (err) {
    console.warn("[transcribe] transcription failed", err)
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
