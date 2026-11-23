import { NextRequest } from "next/server";
import { authenticate, createSessionCookie } from "@/lib/server/auth";
import { apiError, fail, ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json() as { username?: string; password?: string };
    const result = await authenticate(username || "", password || "");
    if (result.error || !result.session) return fail(result.error || "Login gagal", 401);
    await createSessionCookie(result.session);
    return ok({ user: { ...result.session, accessToken: undefined } });
  } catch (error) {
    return apiError(error);
  }
}
