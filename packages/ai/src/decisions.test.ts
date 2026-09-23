import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  decide,
  decisionsUrl,
  isTransientOpenRouterError,
  parseDecisionAnswers,
  type DecisionQuestions,
} from "./decisions.js"
import { verifyDraft } from "./cascade.js"
import { DEFAULT_DECISION_MODEL } from "./models.js"
import { OpenRouterError } from "./openrouter.js"

const KEY = "sk-or-test-decisions-key"

type Captured = { url: string; body: Record<string, unknown>; headers: Record<string, string> }

function mockFetch(reply: (c: Captured) => { status?: number; body: unknown }) {
  const calls: Captured[] = []
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const captured: Captured = {
      url: String(input),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      headers: (init?.headers ?? {}) as Record<string, string>,
    }
    calls.push(captured)
    const out = reply(captured)
    const text = typeof out.body === "string" ? out.body : JSON.stringify(out.body)
    return new Response(text, { status: out.status ?? 200, headers: { "Content-Type": "application/json" } })
  }) as typeof fetch
  return { fetch: impl, calls }
}

const env = (extra: Record<string, string> = {}) =>
  ({ OPENROUTER_API_KEY: KEY, ...extra }) as unknown as NodeJS.ProcessEnv

const QUESTIONS = {
  is_bug: { type: "noul", instructions: "Is the customer reporting a software defect?" },
  team: {
    type: "choice",
    instructions: "Which team should own this ticket?",
    criteria: { payments: "Checkout issues.", frontend: "Rendering issues.", account: "Login issues." },
  },
  urgency: {
    type: "score",
    instructions: "How urgent is this ticket?",
    criteria: ["Can wait", "This week", "Blocking revenue"],
  },
} satisfies DecisionQuestions

/** The live response captured in docs/vendor/jev/jev-tutorial.md. */
const TUTORIAL_RESPONSE = {
  id: "gen-dec-1790015143-AIaTutprXsJ5EwohRSjb",
  model: "typesafe/jev-1.13-20260917",
  provider: "TypeSafe",
  answers: {
    is_bug: { type: "noul", noul: 0.96 },
    team: {
      type: "choice",
      choice: "payments",
      confidence: 0.67,
      probabilities: { payments: 0.78, frontend: 0.22, account: 0 },
    },
    urgency: {
      type: "score",
      score: 1.99,
      confidence: 0.99,
      probabilities: { "0": 0, "1": 0, "2": 1 },
      legend: { "0": "Can wait", "1": "This week", "2": "Blocking revenue" },
    },
  },
  usage: { input_tokens: 476, output_tokens: 70, cost: 0.000019992 },
}

describe("decisionsUrl", () => {
  it("uses the origin of OPENROUTER_BASE_URL (outside /api/v1) or the explicit override", () => {
    assert.equal(decisionsUrl({} as NodeJS.ProcessEnv), "https://openrouter.ai/api/alpha/decisions")
    assert.equal(
      decisionsUrl(env({ OPENROUTER_BASE_URL: "https://proxy.example:8443/api/v1/" })),
      "https://proxy.example:8443/api/alpha/decisions",
    )
    assert.equal(
      decisionsUrl(env({ OPENROUTER_DECISIONS_URL: "https://mock.example/decide/" })),
      "https://mock.example/decide",
    )
    assert.equal(decisionsUrl(env({ OPENROUTER_BASE_URL: "not a url" })), "https://openrouter.ai/api/alpha/decisions")
  })
})

describe("decide", () => {
  it("posts {model, state, questions} to /api/alpha/decisions and parses typed answers", async () => {
    const { fetch, calls } = mockFetch(() => ({ body: TUTORIAL_RESPONSE }))
    const state = { ticket: "Blank checkout page after Pay." }
    const result = await decide({ state, questions: QUESTIONS }, { env: env(), fetch })
    assert.equal(calls.length, 1)
    const call = calls[0]!
    assert.equal(call.url, "https://openrouter.ai/api/alpha/decisions")
    assert.equal(call.headers.Authorization, `Bearer ${KEY}`)
    assert.deepEqual(call.body, { model: DEFAULT_DECISION_MODEL, state, questions: QUESTIONS })

    assert.equal(result.model, "typesafe/jev-1.13-20260917")
    assert.equal(result.provider, "TypeSafe")
    assert.deepEqual(result.answers.is_bug, { type: "noul", noul: 0.96 })
    assert.equal(result.answers.team.choice, "payments")
    assert.equal(result.answers.team.confidence, 0.67)
    assert.equal(result.answers.urgency.score, 1.99)
    assert.equal(result.answers.urgency.legend["2"], "Blocking revenue")
    assert.deepEqual(result.usage, { input_tokens: 476, output_tokens: 70, cost: 0.000019992 })
  })

  it("honours an explicit model", async () => {
    const { fetch, calls } = mockFetch(() => ({ body: TUTORIAL_RESPONSE }))
    await decide({ state: {}, questions: QUESTIONS, model: "~typesafe/jev-latest" }, { env: env(), fetch })
    assert.equal(calls[0]!.body.model, "~typesafe/jev-latest")
  })

  it("defaults a missing confidence to 0 and missing probabilities / legend", () => {
    const answers = parseDecisionAnswers(QUESTIONS, {
      is_bug: { type: "noul", noul: 1.2 },
      team: { type: "choice", choice: "frontend" },
      urgency: { type: "score", score: 9 },
    })
    assert.equal(answers.is_bug.noul, 1)
    assert.equal(answers.team.confidence, 0)
    assert.deepEqual(answers.team.probabilities, {})
    assert.equal(answers.urgency.confidence, 0)
    assert.equal(answers.urgency.score, 2)
    assert.deepEqual(answers.urgency.legend, { "0": "Can wait", "1": "This week", "2": "Blocking revenue" })
  })

  it("rejects missing answers, wrong types and unknown labels as invalid_response", () => {
    const bad = [
      undefined,
      { is_bug: { type: "noul", noul: 0.5 } },
      { ...TUTORIAL_RESPONSE.answers, team: { type: "noul", noul: 0.5 } },
      { ...TUTORIAL_RESPONSE.answers, team: { type: "choice", choice: "legal", confidence: 1 } },
      { ...TUTORIAL_RESPONSE.answers, is_bug: { type: "noul" } },
      { ...TUTORIAL_RESPONSE.answers, urgency: { type: "score", score: "high" } },
    ]
    for (const raw of bad) {
      assert.throws(
        () => parseDecisionAnswers(QUESTIONS, raw),
        (err: unknown) => err instanceof OpenRouterError && err.code === "invalid_response",
      )
    }
  })

  it("validates questions before spending a request", async () => {
    const { fetch, calls } = mockFetch(() => ({ body: TUTORIAL_RESPONSE }))
    await assert.rejects(
      decide({ state: {}, questions: {} }, { env: env(), fetch }),
      (err: unknown) => err instanceof OpenRouterError && err.code === "bad_request",
    )
    await assert.rejects(
      decide(
        { state: {}, questions: { one: { type: "choice", criteria: { only: "x" } } } },
        { env: env(), fetch },
      ),
      (err: unknown) => err instanceof OpenRouterError && err.code === "bad_request",
    )
    assert.equal(calls.length, 0)
  })

  it("throws unconfigured without a key and never calls fetch", async () => {
    const { fetch, calls } = mockFetch(() => ({ body: TUTORIAL_RESPONSE }))
    await assert.rejects(
      decide({ state: {}, questions: QUESTIONS }, { env: {} as NodeJS.ProcessEnv, fetch }),
      (err: unknown) => err instanceof OpenRouterError && err.code === "unconfigured",
    )
    assert.equal(calls.length, 0)
  })

  it("maps documented error statuses to typed codes without leaking the key", async () => {
    const cases: Array<[number, string, boolean]> = [
      [400, "bad_request", false],
      [401, "auth", false],
      [402, "insufficient_credits", false],
      [403, "auth", false],
      [404, "not_found", false],
      [413, "payload_too_large", false],
      [429, "rate_limited", true],
      [529, "overloaded", true],
    ]
    for (const [status, code, transient] of cases) {
      const { fetch } = mockFetch(() => ({
        status,
        body: { error: { code: status, message: `nope for ${KEY}` } },
      }))
      await assert.rejects(
        decide({ state: {}, questions: QUESTIONS }, { env: env(), fetch }),
        (err: unknown) =>
          err instanceof OpenRouterError &&
          err.status === status &&
          err.code === code &&
          isTransientOpenRouterError(err) === transient &&
          err.message.includes("/api/alpha/decisions") &&
          !err.message.includes(KEY),
      )
    }
  })
})

describe("verifyDraft (Jev-verified cascade)", () => {
  const reply = (choice: string, confidence?: number) => ({
    body: {
      model: "typesafe/jev-1.13-20260917",
      answers: { support: { type: "choice", choice, ...(confidence == null ? {} : { confidence }) } },
      usage: { input_tokens: 300, output_tokens: 5, cost: 0.0000126 },
    },
  })

  it("sends {sources, request, draft} with one choice question and accepts supported ≥ threshold", async () => {
    const { fetch, calls } = mockFetch(() => reply("supported", 0.93))
    const result = await verifyDraft(
      { sources: ["[a] Free plan: 5 members."], request: "How many members?", draft: "Five [a]." },
      {},
      { env: env(), fetch },
    )
    assert.deepEqual(calls[0]!.body.state, {
      sources: ["[a] Free plan: 5 members."],
      request: "How many members?",
      draft: "Five [a].",
    })
    assert.deepEqual(Object.keys(calls[0]!.body.questions as object), ["support"])
    assert.equal(result.accepted, true)
    assert.equal(result.threshold, 0.8)
    assert.equal(result.cost, 0.0000126)
  })

  it("rejects low confidence, unsupported, declined and a missing confidence", async () => {
    for (const [choice, confidence] of [
      ["supported", 0.79],
      ["unsupported", 1],
      ["declined", 0.99],
      ["supported", undefined],
    ] as const) {
      const { fetch } = mockFetch(() => reply(choice, confidence))
      const result = await verifyDraft({ sources: [], request: "r", draft: "d" }, {}, { env: env(), fetch })
      assert.equal(result.accepted, false, `${choice} ${confidence}`)
    }
    const { fetch } = mockFetch(() => reply("supported", 0.85))
    const strict = await verifyDraft(
      { sources: [], request: "r", draft: "d" },
      {},
      { env: env({ JEV_ACCEPT_CONFIDENCE: "0.9" }), fetch },
    )
    assert.equal(strict.accepted, false)
  })
})
