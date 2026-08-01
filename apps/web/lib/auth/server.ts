/**
 * Neon Auth server instance (Managed Better Auth) — ADR 0006.
 * Do not use Clerk. Graceful stub when env is missing.
 */
import { createNeonAuth } from "@neondatabase/auth/next/server";
import { NextResponse, type NextRequest } from "next/server";
import { getNeonAuthConfig, isNeonAuthConfigured } from "./env";

export { isNeonAuthConfigured };

const config = getNeonAuthConfig();

/**
 * Unified Neon Auth instance when env is present; otherwise null.
 * Call sites must check `isNeonAuthConfigured()` / null before use.
 */
export const auth = config
  ? createNeonAuth({
      baseUrl: config.baseUrl,
      cookies: {
        secret: config.cookieSecret,
      },
      logLevel: process.env.NODE_ENV === "production" ? "warn" : "info",
    })
  : null;

export type NeonSessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

export type SessionResult = {
  data: { user: NeonSessionUser; session?: unknown } | null;
  error: Error | null;
  stub: boolean;
};

/** Session lookup — stub returns null user when Neon Auth env is absent. */
export async function getSession(): Promise<SessionResult> {
  if (!auth) {
    return { data: null, error: null, stub: true };
  }
  try {
    const result = await auth.getSession();
    const user = result?.data?.user
      ? {
          id: String(result.data.user.id),
          email: result.data.user.email ?? null,
          name: result.data.user.name ?? null,
        }
      : null;
    return {
      data: user
        ? { user, session: result.data?.session ?? result.data }
        : null,
      error: (result?.error as Error | null) ?? null,
      stub: false,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
      stub: false,
    };
  }
}

/** Require an authenticated Neon Auth user (401 when missing). */
export async function requireUser(): Promise<NeonSessionUser> {
  const { data, stub } = await getSession();
  if (stub) {
    throw new AuthStubError(
      "Neon Auth is not configured (set NEON_AUTH_BASE_URL + NEON_AUTH_COOKIE_SECRET)",
    );
  }
  if (!data?.user?.id) {
    throw new AuthRequiredError("Authentication required");
  }
  return data.user;
}

export class AuthRequiredError extends Error {
  readonly status = 401;
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export class AuthStubError extends Error {
  readonly status = 503;
  constructor(message: string) {
    super(message);
    this.name = "AuthStubError";
  }
}

/** Passthrough proxy when auth env is missing (dev / build). */
export function stubAuthProxy(_request: NextRequest): NextResponse {
  return NextResponse.next();
}

/**
 * Route protection: Neon Auth middleware when configured, else passthrough.
 * Prefer wiring via `apps/web/proxy.ts` (Next.js 16).
 */
export function createAuthProxy(options?: { loginUrl?: string }) {
  if (auth) {
    return auth.middleware({
      loginUrl: options?.loginUrl ?? "/sign-in",
    });
  }
  return stubAuthProxy;
}
