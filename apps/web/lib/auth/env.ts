/**
 * Neon Auth env detection (ADR 0006).
 * Missing vars → stub mode so `next build` / frontend can proceed.
 */
export function isNeonAuthConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const baseUrl = env.NEON_AUTH_BASE_URL?.trim();
  const secret = env.NEON_AUTH_COOKIE_SECRET?.trim();
  return Boolean(baseUrl) && Boolean(secret) && (secret?.length ?? 0) >= 32;
}

export function getNeonAuthConfig(env: NodeJS.ProcessEnv = process.env): {
  baseUrl: string;
  cookieSecret: string;
} | null {
  if (!isNeonAuthConfigured(env)) return null;
  return {
    baseUrl: env.NEON_AUTH_BASE_URL!.trim(),
    cookieSecret: env.NEON_AUTH_COOKIE_SECRET!.trim(),
  };
}
