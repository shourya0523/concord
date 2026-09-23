import { handleRouteError, jsonError, respondTyped } from "@/lib/api/http";
import { getApiUser } from "@/lib/api/auth";
import { TranscribeResponseSchema } from "@/lib/api/grading-ui-schemas";
import {
  MAX_AUDIO_BYTES,
  normaliseAudioType,
  transcribeAudio,
} from "@/lib/voice/transcribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/transcribe — multipart form with an `audio` file (webm/opus from
 * MediaRecorder, ≤ 5 MB). Transcribes via OpenRouter (`LLM_STT_MODEL`) when
 * OPENROUTER_API_KEY is configured; otherwise 501 `transcription_unavailable` so the client keeps
 * the typed answer box. Session-gated like other practice APIs (proxy.ts).
 */
export async function POST(request: Request) {
  try {
    const user = await getApiUser("transcribe voice answers");
    if (!user.ok) return user.response;

    const declared = Number(request.headers.get("content-length") ?? "0");
    // Multipart overhead is small; reject clearly oversized bodies before reading.
    if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES + 64 * 1024) {
      return jsonError(413, "payload_too_large", "Audio must be 5 MB or smaller.");
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("audio");
    if (!file || typeof file === "string") {
      return jsonError(400, "validation_error", "Send the recording as multipart field `audio`.");
    }
    if (file.size === 0) {
      return jsonError(400, "validation_error", "The recording is empty.");
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return jsonError(413, "payload_too_large", "Audio must be 5 MB or smaller.");
    }
    const mediaType = normaliseAudioType(file.type);
    if (!mediaType) {
      return jsonError(415, "unsupported_media_type", `Unsupported audio type: ${file.type || "unknown"}.`);
    }

    const audio = new Uint8Array(await file.arrayBuffer());
    const result = await transcribeAudio({ audio, mediaType });
    if (!result.ok) {
      return result.reason === "unconfigured"
        ? jsonError(501, "transcription_unavailable", result.message)
        : jsonError(502, "transcription_failed", result.message);
    }
    return respondTyped(TranscribeResponseSchema, {
      transcript: result.transcript,
      model: result.model,
      bytes: audio.byteLength,
      media_type: mediaType,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
