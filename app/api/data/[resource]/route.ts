import { NextRequest } from "next/server";
import { all, insert, nextCode, uid } from "@/lib/server/db";
import { can, getSession, logActivity } from "@/lib/server/auth";
import { ADMIN_ONLY_RESOURCES, isResource, scopedDivisionIds, RESOURCE_TABLE } from "@/lib/server/access";
import { apiError, fail, ok } from "@/lib/server/http";
import type { ActivityLog, Division, Personnel } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ resource: string }> }) {
  try {
    const session = await getSession();
    if (!session) throw new Error("UNAUTHORIZED");
    const { resource } = await ctx.params;
    if (!isResource(resource)) return fail("Resource tidak dikenal", 404);
    if (ADMIN_ONLY_RESOURCES.includes(resource) && session.role !== "admin") throw new Error("FORBIDDEN");

    let rows = await all<Record<string, unknown>>(RESOURCE_TABLE[resource]);
    const params = req.nextUrl.searchParams;
    const periodId = params.get("period_id") || "";
    const divisionId = params.get("division_id") || "";
    const q = (params.get("q") || "").toLowerCase();

    const allowedDivisions = await scopedDivisionIds(session, periodId || undefined);
    if (resource === "personnel" && allowedDivisions) {
      const assignments = await all<{ personnel_id: string; division_id: string; status: string }>("assignments");
      const ids = new Set(assignments.filter((a) => allowedDivisions.includes(a.division_id)).map((a) => a.personnel_id));
      rows = rows.filter((r) => ids.has(String(r.id)));
    }
    if (resource === "divisions" && allowedDivisions) rows = rows.filter((r) => allowedDivisions.includes(String(r.id)));
    if (resource === "assignments" && allowedDivisions) rows = rows.filter((r) => allowedDivisions.includes(String(r.division_id)));
    if (periodId && ["divisions", "assignments", "supervisors", "work_assignments"].includes(resource)) {
      rows = rows.filter((r) => r.period_id === periodId);
    }
    if (divisionId && resource === "assignments") rows = rows.filter((r) => r.division_id === divisionId);
    if (params.get("status")) rows = rows.filter((r) => r.status === params.get("status"));
    if (resource === "activity_logs" && session.role === "operator") {
      rows = rows.filter((r) => r.actor_id === session.userId);
    }
    if (resource === "settings") {
      const p = params.get("key");
      if (p) rows = rows.filter((r) => r.key === p);
    }
    if (q) {
      rows = rows.filter((r) => Object.values(r).some((v) => typeof v === "string" && v.toLowerCase().includes(q)));
    }
    return ok({ data: rows, total: rows.length });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ resource: string }> }) {
  try {
    const session = await getSession();
    if (!session) throw new Error("UNAUTHORIZED");
    const { resource } = await ctx.params;
    if (!isResource(resource)) return fail("Resource tidak dikenal", 404);
    if ((ADMIN_ONLY_RESOURCES.includes(resource) || resource === "settings") && session.role !== "admin") throw new Error("FORBIDDEN");
    if (resource === "activity_logs" || resource === "import_rows" || resource === "import_batches") throw new Error("FORBIDDEN");
    if (resource === "profiles") throw new Error("Gunakan halaman Manajemen Akun");

    const body = await req.json() as Record<string, unknown>;
    if (resource === "personnel" || resource === "assignments") {
      const divisionId = String(body.division_id || "");
      if (divisionId && !(await can(session, "create", { divisionId, periodId: String(body.period_id || "") }))) throw new Error("FORBIDDEN");
    } else if (!(await can(session, resource === "divisions" ? "edit" : "create"))) throw new Error("FORBIDDEN");

    const payload: Record<string, unknown> = { ...body, id: typeof body.id === "string" && body.id ? body.id : uid() };
    if (resource === "personnel") {
      if (!String(payload.full_name || "").trim()) return fail("Nama personil wajib diisi");
      payload.code = payload.code || await nextCode("personnel", "P", 4);
      payload.status = payload.status || "aktif";
      const existing = await all<Personnel>("personnel");
      const key = (p: Personnel) => [p.full_name.toLowerCase().replace(/\s+/g, " "), (p.phone || "").replace(/\D/g, ""), (p.korwil || p.origin || "").toLowerCase()].join("|");
      if (req.nextUrl.searchParams.get("force") !== "1" && existing.some((p) => key(p) === key(payload as unknown as Personnel))) {
        return fail("DUPLICATE_WARNING: Personil dengan identitas serupa sudah terdaftar. Periksa sebelum menyimpan.", 409);
      }
    }
    if (resource === "divisions") payload.required_count = Number(payload.required_count) || 0;
    const created = await insert(RESOURCE_TABLE[resource], payload);
    await logActivity({
      actor: session,
      action: "tambah",
      entity_type: resource,
      entity_id: String(created.id),
      division_id: String(body.division_id || (resource === "divisions" ? created.id : "")),
      period_id: String(body.period_id || ""),
      description: `Menambahkan data ${resource}: ${String(body.full_name || body.name || body.username || created.id)}`,
      after_data: created,
    });
    return ok({ data: created }, 201);
  } catch (error) {
    return apiError(error);
  }
}
