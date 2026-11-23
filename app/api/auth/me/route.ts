import { getSession } from "@/lib/server/auth";
import { ok } from "@/lib/server/http";
import { all } from "@/lib/server/db";
import type { OperatorPermission } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return ok({ user: null });
  let permissions: OperatorPermission[] = [];
  if (session.role === "operator") {
    permissions = (await all<OperatorPermission>("operator_permissions")).filter((p) => p.profile_id === session.userId);
  }
  return ok({ user: { ...session, accessToken: undefined }, permissions });
}
