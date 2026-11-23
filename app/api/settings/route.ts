import { NextRequest } from "next/server";
import { setSetting } from "@/lib/server/db";
import { getSession, logActivity } from "@/lib/server/auth";
import { apiError, fail, ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) throw new Error("UNAUTHORIZED");
    const { key, value } = await req.json() as { key?: string; value?: string };
    if (!key) return fail("Kunci pengaturan wajib diisi");
    if (key.startsWith("access_") && session.role !== "admin") throw new Error("FORBIDDEN");
    await setSetting(key, String(value ?? ""));
    await logActivity({ actor: session, action: "pengaturan", entity_type: "settings", entity_id: key, description: `Mengubah pengaturan ${key}` });
    return ok({ data: { key, value } });
  } catch (error) {
    return apiError(error);
  }
}
