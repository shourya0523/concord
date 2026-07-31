import { jsonError } from "@/lib/api/http";
import { getSession, isNeonAuthConfigured } from "@/lib/auth/server";

export type ApiUserResult =
  | { ok: true; userId: string; email?: string | null; stub: boolean }
  | { ok: false; response: Response };

export async function getApiUser(
  action: string,
): Promise<ApiUserResult> {
  const session = await getSession();
  const user = session.data?.user;
  if (user?.id) {
    return { ok: true, userId: user.id, email: user.email, stub: false };
  }
  if (isNeonAuthConfigured()) {
    return {
      ok: false,
      response: jsonError(401, "unauthorized", `Sign in to ${action}`),
    };
  }
  return { ok: true, userId: "dev_stub_user", email: null, stub: true };
}
