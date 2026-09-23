import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  audioFormat,
  cleanTranscript,
  normaliseAudioType,
  transcribeAudio,
  transcriptionModelId,
} from "./transcribe"

const audio = new Uint8Array([1, 2, 3])

describe("transcribeAudio", () => {
  it("returns unconfigured without OPENROUTER_API_KEY (route → 501)", async () => {
    let called = false
    const result = await transcribeAudio(
      { audio, mediaType: "audio/webm" },
      {
        env: {} as NodeJS.ProcessEnv,
        generate: async () => {
          called = true
          return "x"
        },
      },
    )
    assert.equal(result.ok, false)
    assert.equal(result.ok ? null : result.reason, "unconfigured")
    assert.equal(called, false)
  })

  it("uses LLM_STT_MODEL and cleans the transcript", async () => {
    let seen: { modelId: string; mediaType: string } | null = null
    const result = await transcribeAudio(
      { audio, mediaType: "audio/webm" },
      {
        env: { OPENROUTER_API_KEY: "k", LLM_STT_MODEL: "openai/whisper-test" } as unknown as NodeJS.ProcessEnv,
        generate: async (input) => {
          seen = { modelId: input.modelId, mediaType: input.mediaType }
          return "Transcript:  EV is   equity plus net debt "
        },
      },
    )
    assert.deepEqual(seen, { modelId: "openai/whisper-test", mediaType: "audio/webm" })
    assert.deepEqual(result, { ok: true, transcript: "EV is equity plus net debt", model: "openai/whisper-test" })
  })

  it("maps model errors and timeouts to failed", async () => {
    const failed = await transcribeAudio(
      { audio, mediaType: "audio/webm" },
      {
        env: { OPENROUTER_API_KEY: "k" } as unknown as NodeJS.ProcessEnv,
        generate: async () => {
          throw new Error("boom")
        },
      },
    )
    assert.equal(failed.ok ? null : failed.reason, "failed")

    const timedOut = await transcribeAudio(
      { audio, mediaType: "audio/webm" },
      {
        env: { OPENROUTER_API_KEY: "k" } as unknown as NodeJS.ProcessEnv,
        timeoutMs: 5,
        generate: ({ abortSignal }) =>
          new Promise((_, reject) => {
            abortSignal.addEventListener("abort", () => reject(new Error("aborted")))
          }),
      },
    )
    assert.equal(timedOut.ok, false)
    assert.match(timedOut.ok ? "" : timedOut.message, /timed out/)
  })
})

describe("default OpenRouter transcription call", () => {
  it("posts base64 webm to /audio/transcriptions", async () => {
    let url = ""
    let body: Record<string, unknown> = {}
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      url = String(input)
      body = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify({ text: "EV bridge" }))
    }) as typeof fetch
    const result = await transcribeAudio(
      { audio, mediaType: "audio/webm" },
      { env: { OPENROUTER_API_KEY: "k" } as unknown as NodeJS.ProcessEnv, fetch: fetchImpl },
    )
    assert.equal(url, "https://openrouter.ai/api/v1/audio/transcriptions")
    assert.deepEqual(body, {
      model: "openai/whisper-large-v3-turbo",
      input_audio: { data: Buffer.from(audio).toString("base64"), format: "webm" },
      language: "en",
    })
    assert.deepEqual(result, { ok: true, transcript: "EV bridge", model: "openai/whisper-large-v3-turbo" })
  })

  it("maps a provider rejection (e.g. unsupported webm) to failed", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { message: "unsupported format" } }), { status: 400 })) as typeof fetch
    const result = await transcribeAudio(
      { audio, mediaType: "audio/webm" },
      { env: { OPENROUTER_API_KEY: "k" } as unknown as NodeJS.ProcessEnv, fetch: fetchImpl },
    )
    assert.equal(result.ok ? null : result.reason, "failed")
  })
})

describe("helpers", () => {
  it("normalises audio media types", () => {
    assert.equal(normaliseAudioType("audio/webm;codecs=opus"), "audio/webm")
    assert.equal(normaliseAudioType("AUDIO/OGG"), "audio/ogg")
    assert.equal(normaliseAudioType("video/mp4"), null)
    assert.equal(normaliseAudioType(null), null)
  })

  it("defaults the model when LLM_STT_MODEL is unset", () => {
    assert.equal(transcriptionModelId({} as NodeJS.ProcessEnv), "openai/whisper-large-v3-turbo")
  })

  it("maps media types to OpenRouter input_audio formats", () => {
    assert.equal(audioFormat("audio/webm"), "webm")
    assert.equal(audioFormat("audio/mpeg"), "mp3")
    assert.equal(audioFormat("audio/x-wav"), "wav")
    assert.equal(audioFormat("audio/mp4"), "m4a")
  })

  it("strips code fences", () => {
    assert.equal(cleanTranscript("```text\nhello there\n```"), "hello there")
  })
})
