import { getAuth } from "@/lib/auth/server"

const auth = getAuth()

async function notConfigured() {
  return Response.json(
    {
      error: "Neon Auth is not configured",
      hint: "Set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET (≥32 chars). See ADR 0006.",
      provider: "neon-auth",
    },
    { status: 503 }
  )
}

const handlers = auth?.handler()

export const GET = handlers?.GET ?? notConfigured
export const POST = handlers?.POST ?? notConfigured
