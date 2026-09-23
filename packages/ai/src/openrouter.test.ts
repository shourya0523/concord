import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { z } from "zod"
import { cosineSimilarity, embedTexts, isEmbeddingConfigured } from "./embeddings.js"
import { gradeModelConfig } from "./grade.js"
import {
  DEFAULT_DECISION_MODEL,
  DEFAULT_EMBED_MODEL,
  DEFAULT_JEV_ACCEPT_CONFIDENCE,
  DEFAULT_JEV_CONFIDENCE_FLOOR,
  DEFAULT_SMALL_MODEL,
  DEFAULT_STT_MODEL,
  decisionModel,
  isJevModel,
  isLlmConfigured,
  jevAcceptConfidence,
  jevConfidenceFloor,
  resetModelWarnings,
  tierModels,
} from "./models.js"
import {
  chat,
  chatJson,
  embed,
  errorCodeForStatus,
  extractJson,
  OpenRouterError,
  transcribe,
} from "./openrouter.js"

const KEY = "sk-or-test-secret-key"

type Captured = { url: string; init: RequestInit; body: Record<string, unknown>; headers: Record<string, string> }

function mockFetch(
  reply: (captured: Captured) => { status?: number; body: unknown } | Promise<never>,
): { fetch: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = []
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const captured: Captured = {
      url: String(input),
      init: init ?? {},
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      headers: (init?.headers ?? {}) as Record<string, string>,
    }
    calls.push(captured)
    const out = await reply(captured)
    const text = typeof out.body === "string" ? out.body : JSON.stringify(out.body)
    return new Response(text, { status: out.status ?? 200, headers: { "Content-Type": "application/json" } })
  }) as typeof fetch
  return { fetch: impl, calls }
}

const env = (extra: Record<string, string> = {}) =>
  ({ OPENROUTER_API_KEY: KEY, ...extra }) as unknown as NodeJS.ProcessEnv

const chatReply = (content: string, model = "deepseek/deepseek-v4.1-flash") => ({
  body: {
    id: "gen-1",
    model,
    choices: [{ message: { role: "assistant", content } }],
    usage: { prompt_tokens: 120, completion_tokens: 30, cost: 0.0000123 },
  },
})

describe("model tiers", () => {
  it("defaults and env overrides", () => {
    const empty = {} as NodeJS.ProcessEnv
    assert.equal(DEFAULT_DECISION_MODEL, "typesafe/jev-1.13")
    assert.equal(decisionModel(empty), DEFAULT_DECISION_MODEL)
    assert.deepEqual(tierModels("small", empty), [DEFAULT_SMALL_MODEL])
    assert.equal(isLlmConfigured(empty), false)
    assert.equal(isEmbeddingConfigured(env()), true)
    assert.equal(decisionModel(env({ LLM_DECISION_MODEL: "~typesafe/jev-latest" })), "~typesafe/jev-latest")
    assert.equal(jevConfidenceFloor(empty), DEFAULT_JEV_CONFIDENCE_FLOOR)
    assert.equal(jevAcceptConfidence(empty), DEFAULT_JEV_ACCEPT_CONFIDENCE)
    assert.equal(jevConfidenceFloor(env({ JEV_CONFIDENCE_FLOOR: "0.75" })), 0.75)
    // Out-of-range / junk thresholds fall back to the defaults.
    assert.equal(jevConfidenceFloor(env({ JEV_CONFIDENCE_FLOOR: "7" })), DEFAULT_JEV_CONFIDENCE_FLOOR)
    assert.equal(jevAcceptConfidence(env({ JEV_ACCEPT_CONFIDENCE: "high" })), DEFAULT_JEV_ACCEPT_CONFIDENCE)
  })

  it("GRADER_MODEL overrides the decision model only for Jev ids, warning once otherwise", () => {
    assert.ok(isJevModel("typesafe/jev-1.13"))
    assert.ok(isJevModel("~typesafe/jev-latest"))
    assert.ok(!isJevModel("z-ai/glm-4.7-flash"))
    assert.equal(decisionModel(env({ GRADER_MODEL: "typesafe/jev-1.12" })), "typesafe/jev-1.12")
    resetModelWarnings()
    const warnings: unknown[] = []
    const original = console.warn
    console.warn = (...args: unknown[]) => void warnings.push(args)
    try {
      assert.equal(decisionModel(env({ GRADER_MODEL: "z-ai/glm-4.7-flash" })), DEFAULT_DECISION_MODEL)
      assert.equal(decisionModel(env({ GRADER_MODEL: "gemini-3.6-flash" })), DEFAULT_DECISION_MODEL)
    } finally {
      console.warn = original
    }
    assert.equal(warnings.length, 1)
  })

  it("gradeModelConfig: Jev decisions, small chat escalation", () => {
    assert.deepEqual(gradeModelConfig({} as NodeJS.ProcessEnv), {
      decisionModel: DEFAULT_DECISION_MODEL,
      chatModel: DEFAULT_SMALL_MODEL,
      confidenceFloor: DEFAULT_JEV_CONFIDENCE_FLOOR,
      route: "openrouter",
      available: false,
    })
    assert.equal(gradeModelConfig(env()).available, true)
  })
})

describe("chat", () => {
  it("posts to /chat/completions with auth, attribution headers, fallback models and usage accounting", async () => {
    const { fetch, calls } = mockFetch(() => chatReply("hello"))
    const result = await chat(
      { models: ["deepseek/deepseek-v4.1-flash", DEFAULT_SMALL_MODEL], messages: [{ role: "user", content: "hi" }], temperature: 0, maxTokens: 50 },
      { env: env({ NEXT_PUBLIC_APP_URL: "https://concord.example" }), fetch },
    )
    assert.equal(calls.length, 1)
    const call = calls[0]!
    assert.equal(call.url, "https://openrouter.ai/api/v1/chat/completions")
    assert.equal(call.init.method, "POST")
    assert.equal(call.headers.Authorization, `Bearer ${KEY}`)
    assert.equal(call.headers["X-Title"], "Concord")
    assert.equal(call.headers["HTTP-Referer"], "https://concord.example")
    assert.equal(call.body.model, "deepseek/deepseek-v4.1-flash")
    assert.deepEqual(call.body.models, ["deepseek/deepseek-v4.1-flash", DEFAULT_SMALL_MODEL])
    assert.deepEqual(call.body.usage, { include: true })
    assert.equal(call.body.temperature, 0)
    assert.equal(call.body.max_tokens, 50)
    assert.equal(call.body.response_format, undefined)
    assert.deepEqual(result, {
      text: "hello",
      model: "deepseek/deepseek-v4.1-flash",
      usage: { input_tokens: 120, output_tokens: 30, cost: 0.0000123 },
    })
  })

  it("honours OPENROUTER_BASE_URL / OPENROUTER_APP_URL and sends no fallback list for the small tier", async () => {
    const { fetch, calls } = mockFetch(() => chatReply("ok"))
    await chat(
      { tier: "small", messages: [{ role: "user", content: "hi" }] },
      {
        env: env({
          OPENROUTER_BASE_URL: "https://proxy.example/v1/",
          OPENROUTER_APP_URL: "https://app.example",
          NEXT_PUBLIC_APP_URL: "https://ignored.example",
        }),
        fetch,
      },
    )
    assert.equal(calls[0]!.url, "https://proxy.example/v1/chat/completions")
    assert.equal(calls[0]!.headers["HTTP-Referer"], "https://app.example")
    assert.equal(calls[0]!.body.model, DEFAULT_SMALL_MODEL)
    assert.equal(calls[0]!.body.models, undefined)
  })

  it("explicit model skips the tier list", async () => {
    const { fetch, calls } = mockFetch(() => chatReply("ok"))
    await chat({ model: "z-ai/glm-4.7-flash", messages: [{ role: "user", content: "x" }] }, { env: env(), fetch })
    assert.equal(calls[0]!.body.model, "z-ai/glm-4.7-flash")
    assert.equal(calls[0]!.body.models, undefined)
  })

  it("throws unconfigured without a key and never calls fetch", async () => {
    const { fetch, calls } = mockFetch(() => chatReply("x"))
    await assert.rejects(
      chat({ messages: [{ role: "user", content: "x" }] }, { env: {} as NodeJS.ProcessEnv, fetch }),
      (err: unknown) => err instanceof OpenRouterError && err.code === "unconfigured",
    )
    assert.equal(calls.length, 0)
  })
})

describe("error mapping", () => {
  it("maps HTTP statuses to typed codes and never leaks the key", async () => {
    const cases: Array<[number, string]> = [
      [400, "bad_request"],
      [401, "auth"],
      [402, "insufficient_credits"],
      [404, "not_found"],
      [408, "timeout"],
      [413, "payload_too_large"],
      [429, "rate_limited"],
      [502, "upstream"],
      [529, "overloaded"],
    ]
    for (const [status, code] of cases) {
      assert.equal(errorCodeForStatus(status), code)
      const { fetch } = mockFetch(() => ({
        status,
        body: { error: { code: status, message: `bad things with ${KEY}` } },
      }))
      await assert.rejects(
        chat({ messages: [{ role: "user", content: "x" }] }, { env: env(), fetch }),
        (err: unknown) =>
          err instanceof OpenRouterError &&
          err.status === status &&
          err.code === code &&
          !err.message.includes(KEY) &&
          err.message.includes("[redacted]"),
      )
    }
  })

  it("treats an error object inside a 200 body as a failure", async () => {
    const { fetch } = mockFetch(() => ({ body: { error: { code: 503, message: "provider down" } } }))
    await assert.rejects(
      chat({ messages: [{ role: "user", content: "x" }] }, { env: env(), fetch }),
      (err: unknown) => err instanceof OpenRouterError && err.code === "upstream" && err.status === 503,
    )
  })

  it("maps network failures and aborts", async () => {
    const network = (async () => {
      throw new TypeError("fetch failed")
    }) as unknown as typeof fetch
    await assert.rejects(
      chat({ messages: [{ role: "user", content: "x" }] }, { env: env(), fetch: network }),
      (err: unknown) => err instanceof OpenRouterError && err.code === "network" && err.status === null,
    )
    const controller = new AbortController()
    controller.abort()
    const aborting = (async () => {
      throw new DOMException("aborted", "AbortError")
    }) as unknown as typeof fetch
    await assert.rejects(
      chat({ messages: [{ role: "user", content: "x" }], signal: controller.signal }, { env: env(), fetch: aborting }),
      (err: unknown) => err instanceof OpenRouterError && err.code === "aborted",
    )
  })

  it("rejects non-JSON and empty choices", async () => {
    const { fetch } = mockFetch(() => ({ body: "<html>" }))
    await assert.rejects(
      chat({ messages: [{ role: "user", content: "x" }] }, { env: env(), fetch }),
      (err: unknown) => err instanceof OpenRouterError && err.code === "invalid_response",
    )
    const empty = mockFetch(() => ({ body: { choices: [] } }))
    await assert.rejects(
      chat({ messages: [{ role: "user", content: "x" }] }, { env: env(), fetch: empty.fetch }),
      (err: unknown) => err instanceof OpenRouterError && err.code === "invalid_response",
    )
  })
})

describe("chatJson", () => {
  const Schema = z.object({
    score: z.number().min(0).max(1),
    items: z.array(z.string()).default([]),
    follow_up_id: z.string().nullable().default(null),
  })

  it("sends a strict json_schema response_format and validates the reply", async () => {
    const { fetch, calls } = mockFetch(() =>
      chatReply('```json\n{"score": 0.8, "items": null, "follow_up_id": null}\n```'),
    )
    const result = await chatJson(
      Schema,
      {
        tier: "small",
        schemaName: "rubric_judge",
        messages: [
          { role: "system", content: "You grade." },
          { role: "user", content: "Grade this." },
        ],
      },
      { env: env(), fetch },
    )
    const body = calls[0]!.body
    const format = body.response_format as {
      type: string
      json_schema: { name: string; strict: boolean; schema: Record<string, unknown> }
    }
    assert.equal(format.type, "json_schema")
    assert.equal(format.json_schema.name, "rubric_judge")
    assert.equal(format.json_schema.strict, true)
    assert.equal(format.json_schema.schema.type, "object")
    assert.equal(format.json_schema.schema.additionalProperties, false)
    assert.deepEqual(format.json_schema.schema.required, ["score", "items", "follow_up_id"])
    assert.ok(!JSON.stringify(format.json_schema.schema).includes('"default"'))
    assert.ok(!JSON.stringify(format.json_schema.schema).includes("$schema"))
    assert.equal(body.model, DEFAULT_SMALL_MODEL)
    assert.equal(body.models, undefined)
    const messages = body.messages as Array<{ role: string; content: string }>
    assert.equal(messages.length, 2)
    assert.match(messages[0]!.content, /^You grade\.\n\nReply with only a JSON object/)
    assert.deepEqual(result.object, { score: 0.8, items: [], follow_up_id: null })
    assert.equal(result.usage.input_tokens, 120)
  })

  it("throws invalid_response for replies that fail the schema", async () => {
    const { fetch } = mockFetch(() => chatReply('{"score": 3}'))
    await assert.rejects(
      chatJson(Schema, { messages: [{ role: "user", content: "x" }] }, { env: env(), fetch }),
      (err: unknown) => err instanceof OpenRouterError && err.code === "invalid_response",
    )
  })

  it("extractJson strips fences and prose", () => {
    assert.equal(extractJson('Here you go: {"a":1} thanks'), '{"a":1}')
    assert.equal(extractJson('```\n{"a":1}\n```'), '{"a":1}')
  })
})

describe("embed", () => {
  it("posts model, input and dimensions; returns vectors in input order", async () => {
    const { fetch, calls } = mockFetch(() => ({
      body: {
        data: [
          { index: 1, embedding: [0, 1, 0] },
          { index: 0, embedding: [1, 0, 0] },
        ],
      },
    }))
    const vectors = await embed(["a", "b"], { dimensions: 3 }, { env: env(), fetch })
    assert.equal(calls[0]!.url, "https://openrouter.ai/api/v1/embeddings")
    assert.deepEqual(calls[0]!.body, { model: DEFAULT_EMBED_MODEL, input: ["a", "b"], dimensions: 3 })
    assert.deepEqual(vectors, [
      [1, 0, 0],
      [0, 1, 0],
    ])
  })

  it("embedTexts defaults to 768 dims and rejects a dimension mismatch", async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { data: [{ index: 0, embedding: [1, 2] }] } }))
    await assert.rejects(
      embedTexts(["a"], { env: env({ LLM_EMBED_MODEL: "openai/text-embedding-3-large" }), fetch }),
      (err: unknown) => err instanceof OpenRouterError && err.code === "invalid_response",
    )
    assert.deepEqual(calls[0]!.body, { model: "openai/text-embedding-3-large", input: ["a"], dimensions: 768 })
    assert.deepEqual(await embedTexts([], { env: env(), fetch }), [])
  })

  it("cosineSimilarity", () => {
    assert.equal(cosineSimilarity([1, 0], [1, 0]), 1)
    assert.equal(cosineSimilarity([1, 0], [0, 1]), 0)
    assert.equal(cosineSimilarity([0, 0], [1, 1]), 0)
  })
})

describe("transcribe", () => {
  it("posts input_audio JSON to /audio/transcriptions", async () => {
    const { fetch, calls } = mockFetch(() => ({ body: { text: "EV is equity plus net debt" } }))
    const result = await transcribe({ base64: "AAEC", format: "webm", language: "en" }, { env: env(), fetch })
    assert.equal(calls[0]!.url, "https://openrouter.ai/api/v1/audio/transcriptions")
    assert.deepEqual(calls[0]!.body, {
      model: DEFAULT_STT_MODEL,
      input_audio: { data: "AAEC", format: "webm" },
      language: "en",
    })
    assert.deepEqual(result, { text: "EV is equity plus net debt", model: DEFAULT_STT_MODEL })
  })

  it("rejects a reply without text", async () => {
    const { fetch } = mockFetch(() => ({ body: {} }))
    await assert.rejects(
      transcribe({ base64: "AA", format: "wav" }, { env: env(), fetch }),
      (err: unknown) => err instanceof OpenRouterError && err.code === "invalid_response",
    )
  })
})
