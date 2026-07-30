/** DATABASE_URL presence — product reads degrade to bank JSON without it. */
export function isDatabaseConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.DATABASE_URL?.trim());
}
