/**
 * Bring-your-own OpenRouter key (DESIGN.md §17.4, migration 064).
 *
 * The key is encrypted with AES-256-GCM under BYOK_ENCRYPTION_KEY before it
 * is stored, decrypted only on the server for the request that needs it, and
 * never sent back to the browser (Settings shows the last four characters).
 * Without BYOK_ENCRYPTION_KEY in production the feature is off; local dev and
 * tests use a fixed development key.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

import { DEFAULT_OPENROUTER_BASE_URL } from "@ibpe/ai"

const CIPHER = "aes-256-gcm"
const VERSION = "v1"
const DEV_SECRET = "concord-dev-byok-key"

/** 32-byte key from BYOK_ENCRYPTION_KEY (any string, hashed), or null when BYOK is off. */
export function byokCipherKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const secret = env.BYOK_ENCRYPTION_KEY?.trim()
  if (secret) return createHash("sha256").update(secret).digest()
  if (env.NODE_ENV === "production") return null
  return createHash("sha256").update(DEV_SECRET).digest()
}

export function isByokAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return byokCipherKey(env) !== null
}

/** `v1.<iv>.<tag>.<ciphertext>`, base64url parts. */
export function encryptKey(plain: string, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(CIPHER, key, iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return [VERSION, iv, cipher.getAuthTag(), data].map((part) => (typeof part === "string" ? part : part.toString("base64url"))).join(".")
}

/** Plaintext key, or null when the blob is malformed or the cipher key changed. */
export function decryptKey(blob: string, key: Buffer): string | null {
  const [version, iv, tag, data] = blob.split(".")
  if (version !== VERSION || !iv || !tag || !data) return null
  try {
    const decipher = createDecipheriv(CIPHER, key, Buffer.from(iv, "base64url"))
    decipher.setAuthTag(Buffer.from(tag, "base64url"))
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

/** OpenRouter keys look like `sk-or-v1-<hex>`. Loose check; OpenRouter has the final say. */
export function looksLikeOpenRouterKey(value: string): boolean {
  return /^sk-or-[A-Za-z0-9_-]{16,200}$/.test(value)
}

export function keyLast4(value: string): string {
  return value.slice(-4)
}

/** The env the AI helpers should use for this user: their key replaces ours. */
export function envWithKey(key: string | null, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return key ? { ...env, OPENROUTER_API_KEY: key } : env
}

export type KeyCheck = { ok: true } | { ok: false; reason: "invalid" | "unreachable"; message: string }

/** Ask OpenRouter whether the key works (GET /key). Never logs or echoes the key. */
export async function verifyOpenRouterKey(
  key: string,
  options: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<KeyCheck> {
  const env = options.env ?? process.env
  const base = (env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL).replace(/\/$/, "")
  try {
    const response = await (options.fetch ?? fetch)(`${base}/key`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    })
    if (response.ok) return { ok: true }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: "invalid", message: "OpenRouter didn't accept that key." }
    }
    return { ok: false, reason: "unreachable", message: `OpenRouter couldn't check the key (HTTP ${response.status}). Try again.` }
  } catch {
    return { ok: false, reason: "unreachable", message: "Couldn't reach OpenRouter to check the key. Try again." }
  }
}
