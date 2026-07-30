"use server";

/**
 * Server Actions for practice — typed via @ibpe/contracts.
 * Prefer these from RSC forms; route handlers remain for fetch clients.
 */
import {
  CreatePracticeSessionRequestSchema,
  type CreatePracticeSessionRequest,
  type PracticeSessionResponse,
} from "@/lib/api/schemas";
import { getSession, isNeonAuthConfigured } from "@/lib/auth/server";
import { createPracticeSession } from "@/lib/data/practice";

export async function startPracticeSession(
  raw: CreatePracticeSessionRequest,
): Promise<PracticeSessionResponse> {
  const input = CreatePracticeSessionRequestSchema.parse(raw);
  const session = await getSession();
  let userId = session.data?.user?.id;
  if (!userId) {
    if (isNeonAuthConfigured()) {
      throw new Error("Authentication required");
    }
    userId = "dev_stub_user";
  }
  return createPracticeSession({ userId, input });
}
