import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  cleanTranscript,
  normaliseAudioType,
  transcribeAudio,
  transcriptionModelId,
} from "./transcribe"

const audio = new Uint8Array([1, 2, 3])

describe("transcribeAudio", () => {
  it("returns unconfigured without a Gemini key (route → 501)", async () => {
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

  it("uses GRADER_MODEL and cleans the transcript", async () => {
    let seen: { modelId: string; mediaType: string } | null = null
    const result = await transcribeAudio(
      { audio, mediaType: "audio/webm" },
      {
        env: { GEMINI_API_KEY: "k", GRADER_MODEL: "gemini-test" } as unknown as NodeJS.ProcessEnv,
        generate: async (input) => {
          seen = { modelId: input.modelId, mediaType: input.mediaType }
          return "Transcript:  EV is   equity plus net debt "
        },
      },
    )
    assert.deepEqual(seen, { modelId: "gemini-test", mediaType: "audio/webm" })
    assert.deepEqual(result, { ok: true, transcript: "EV is equity plus net debt", model: "gemini-test" })
  })

  it("maps model errors and timeouts to failed", async () => {
    const failed = await transcribeAudio(
      { audio, mediaType: "audio/webm" },
      {
        env: { GEMINI_API_KEY: "k" } as unknown as NodeJS.ProcessEnv,
        generate: async () => {
          throw new Error("boom")
        },
      },
    )
    assert.equal(failed.ok ? null : failed.reason, "failed")

    const timedOut = await transcribeAudio(
      { audio, mediaType: "audio/webm" },
      {
        env: { GEMINI_API_KEY: "k" } as unknown as NodeJS.ProcessEnv,
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

describe("helpers", () => {
  it("normalises audio media types", () => {
    assert.equal(normaliseAudioType("audio/webm;codecs=opus"), "audio/webm")
    assert.equal(normaliseAudioType("AUDIO/OGG"), "audio/ogg")
    assert.equal(normaliseAudioType("video/mp4"), null)
    assert.equal(normaliseAudioType(null), null)
  })

  it("defaults the model when GRADER_MODEL is unset", () => {
    assert.ok(transcriptionModelId({} as NodeJS.ProcessEnv).length > 0)
  })

  it("strips code fences", () => {
    assert.equal(cleanTranscript("```text\nhello there\n```"), "hello there")
  })
})
