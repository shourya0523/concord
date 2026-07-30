import { type ZodTypeAny, type output } from "zod";
import { NextResponse } from "next/server";
import { AuthRequiredError, AuthStubError } from "@/lib/auth/server";
import { DatabaseUnavailableError } from "@/lib/db/client";

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, { status: init?.status ?? 200, ...init });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse {
  const body: ApiErrorBody = {
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  };
  return NextResponse.json(body, { status });
}

/** Parse + validate with a Zod schema; 400 on failure. */
export function parseOrError<S extends ZodTypeAny>(
  schema: S,
  raw: unknown,
): { ok: true; data: output<S> } | { ok: false; response: NextResponse } {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError(400, "validation_error", "Invalid request", parsed.error.flatten()),
    };
  }
  return { ok: true, data: parsed.data as output<S> };
}

/** Validate outbound payload; 500 if contracts drift. */
export function respondTyped<S extends ZodTypeAny>(
  schema: S,
  data: unknown,
  init?: ResponseInit,
): NextResponse {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    console.error("[api] response contract violation", parsed.error.flatten());
    return jsonError(
      500,
      "contract_violation",
      "Response failed contract validation",
      parsed.error.flatten(),
    );
  }
  return jsonOk(parsed.data, init);
}

export function handleRouteError(err: unknown): NextResponse {
  if (err instanceof AuthRequiredError) {
    return jsonError(401, "unauthorized", err.message);
  }
  if (err instanceof AuthStubError) {
    return jsonError(503, "auth_not_configured", err.message);
  }
  if (err instanceof DatabaseUnavailableError) {
    return jsonError(503, "database_unavailable", err.message);
  }
  console.error("[api]", err);
  return jsonError(
    500,
    "internal_error",
    err instanceof Error ? err.message : "Internal server error",
  );
}
