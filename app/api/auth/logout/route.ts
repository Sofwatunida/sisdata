import { clearSessionCookie, getSession } from "@/lib/server/auth";
import { ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearSessionCookie();
  return ok({ success: true });
}
