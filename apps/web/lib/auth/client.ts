"use client"

import { createAuthClient } from "@neondatabase/auth/next"

type AuthClient = ReturnType<typeof createAuthClient>

/** Browser auth client — posts to `/api/auth/*` (Neon Auth handler). */
export const authClient: AuthClient = createAuthClient()
