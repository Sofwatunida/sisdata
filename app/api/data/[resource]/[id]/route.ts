import { NextRequest } from "next/server";
import { all, find, patch, remove } from "@/lib/server/db";
import { getSession, isValidEmail, logActivity, normalizeEmail, syncProfileAuth } from "@/lib/server/auth";
import { ADMIN_ONLY_READ_RESOURCES, ADMIN_ONLY_RESOURCES, canAccessDivision, isResource, RESOURCE_TABLE } from "@/lib/server/access";
import { apiError, fail, ok } from "@/lib/server/http";
import type { Division, Profile } from "@/lib/types";
import { divisionNameKey, normalizeDivisionName } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ resource: string; id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await getSession();
    if (!session) throw new Error("UNAUTHORIZED");
    const { resource, id } = await ctx.params;
    if (!isResource(resource)) return fail("Resource tidak dikenal", 404);
    if (ADMIN_ONLY_READ_RESOURCES.includes(resource) && session.role !== "admin") throw new Error("FORBIDDEN");
    const row = await find(RESOURCE_TABLE[resource], id);
    if (!row) return fail("Data tidak ditemukan", 404);
    return ok({ data: row });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getSession();
    if (!session) throw new Error("UNAUTHORIZED");
    const { resource, id } = await ctx.params;
    if (!isResource(resource)) return fail("Resource tidak dikenal", 404);
    if ((ADMIN_ONLY_RESOURCES.includes(resource) || resource === "settings") && session.role !== "admin") throw new Error("FORBIDDEN");
    if (["activity_logs", "import_rows", "import_batches", "backups"].includes(resource)) throw new Error("FORBIDDEN");
    const changes = await req.json() as Record<string, unknown>;
    if (resource === "profiles") delete changes.password_hash;
    const before = await find(RESOURCE_TABLE[resource], id);
    if (!before) return fail("Data tidak ditemukan", 404);

    if (resource === "profiles") {
      const current = before as unknown as Profile;
      const nextUsername = String(changes.username ?? current.username).trim().toLowerCase();
      if (!nextUsername) return fail("Username wajib diisi");
      const profiles = await all<Profile>("profiles");
      const usernameChanged = nextUsername !== current.username;
      if (usernameChanged && profiles.some((p) => p.id !== id && p.username.toLowerCase() === nextUsername)) return fail("Username sudah digunakan", 409);
      if (usernameChanged) changes.username = nextUsername;

      const emailChanged = changes.email !== undefined;
      let nextEmail = normalizeEmail(changes.email ?? current.email);
      if (!nextEmail && usernameChanged) nextEmail = `${nextUsername}@pendataan.local`;
      if (emailChanged || (!current.email && usernameChanged)) {
        if (!isValidEmail(nextEmail)) return fail("Email tidak valid", 400);
        if (profiles.some((p) => p.id !== id && normalizeEmail(p.email) === nextEmail)) return fail("Email sudah digunakan", 409);
        changes.email = nextEmail;
      }

      await syncProfileAuth(id, {
        username: usernameChanged ? nextUsername : undefined,
        email: nextEmail || undefined,
        full_name: changes.full_name ? String(changes.full_name) : undefined,
      });
    }

    const divisionId = String(changes.division_id || (before as { division_id?: string }).division_id || (resource === "divisions" ? id : ""));
    if (resource === "personnel" || resource === "assignments" || resource === "divisions") {
      if (!(await canAccessDivision(session, divisionId, "edit"))) throw new Error("FORBIDDEN");
    }
    if (resource === "periods") {
      const name = String(changes.name ?? ((before as { name?: string }).name || "")).trim();
      if (!name) return fail("Nama periode wajib diisi");
      changes.name = name;
    }
    if (resource === "divisions") {
      const nextName = changes.name !== undefined
        ? normalizeDivisionName(String(changes.name))
        : normalizeDivisionName(String((before as { name?: string }).name || ""));
      if (!nextName) return fail("Nama bagian wajib diisi");
      if (changes.name !== undefined) changes.name = nextName;

      const nextPeriodId = changes.period_id !== undefined
        ? String(changes.period_id || "")
        : String((before as { period_id?: string }).period_id || "");
      if (changes.period_id !== undefined) {
        if (nextPeriodId) changes.period_id = nextPeriodId;
        else delete changes.period_id;
      }

      const divisions = await all<Division>("divisions");
      if (divisions.some((d) => d.id !== id && String(d.period_id || "") === nextPeriodId && divisionNameKey(d.name) === divisionNameKey(nextName))) {
        return fail(`Bagian "${nextName}" sudah terdaftar pada periode ini.`, 409);
      }

      if (changes.code !== undefined) {
        const nextCode = normalizeDivisionName(String(changes.code));
        if (!nextCode) return fail("Kode bagian wajib diisi");
        if (divisions.some((d) => d.id !== id && String(d.code || "").trim().toLowerCase() === nextCode.toLowerCase())) {
          return fail("Kode bagian sudah digunakan", 409);
        }
        changes.code = nextCode;
      }
      if (changes.required_count !== undefined) changes.required_count = Number(changes.required_count) || 0;
    }
    if (resource === "personnel") {
      const name = String(changes.full_name ?? ((before as { full_name?: string }).full_name || "")).trim();
      if (!name) return fail("Nama personil wajib diisi");
      const rows = await all<{ id: string; full_name: string; phone?: string; korwil?: string; origin?: string }>("personnel");
      const key = (p: { full_name: string; phone?: string; korwil?: string; origin?: string }) =>
        [p.full_name.toLowerCase().replace(/\s+/g, " "), (p.phone || "").replace(/\D/g, ""), (p.korwil || p.origin || "").toLowerCase()].join("|");
      const candidate = {
        full_name: name,
        phone: String(changes.phone ?? ((before as { phone?: string }).phone || "")),
        korwil: String(changes.korwil ?? ((before as { korwil?: string }).korwil || "")),
      };
      if (req.nextUrl.searchParams.get("force") !== "1" && rows.some((r) => r.id !== id && key(r) === key(candidate))) {
        return fail("DUPLICATE_WARNING: Personil dengan identitas serupa sudah terdaftar.", 409);
      }
    }
    const updated = await patch(RESOURCE_TABLE[resource], id, changes);
    await logActivity({
      actor: session,
      action: changes.status === "nonaktif" ? "nonaktifkan" : "edit",
      entity_type: resource,
      entity_id: id,
      division_id: divisionId,
      period_id: String(changes.period_id || (before as { period_id?: string }).period_id || ""),
      description: `Mengubah data ${resource}: ${String(changes.full_name || changes.name || id)}`,
      before_data: before,
      after_data: updated,
    });
    return ok({ data: updated });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await getSession();
    if (!session) throw new Error("UNAUTHORIZED");
    const { resource, id } = await ctx.params;
    if (!isResource(resource)) return fail("Resource tidak dikenal", 404);
    if (["activity_logs", "import_rows", "import_batches", "backups"].includes(resource)) throw new Error("FORBIDDEN");
    if (ADMIN_ONLY_RESOURCES.includes(resource) && session.role !== "admin") throw new Error("FORBIDDEN");
    const before = await find(RESOURCE_TABLE[resource], id);
    if (!before) return fail("Data tidak ditemukan", 404);
    const divisionId = String((before as { division_id?: string }).division_id || (resource === "divisions" ? id : ""));
    if (resource === "divisions") {
      const assignments = await all<{ division_id: string }>("assignments");
      if (assignments.some((a) => a.division_id === id)) {
        return fail("Bagian memiliki riwayat penugasan. Jangan hapus bagian ini; gunakan status Nonaktif jika sudah tidak dipakai.", 409);
      }
    }
    if (resource === "personnel" || resource === "assignments" || resource === "divisions") {
      if (!(await canAccessDivision(session, divisionId, "delete"))) throw new Error("FORBIDDEN");
    }
    if (resource === "personnel") {
      await patch("personnel", id, { status: "nonaktif" });
      await logActivity({
        actor: session,
        action: "nonaktifkan",
        entity_type: resource,
        entity_id: id,
        division_id: divisionId,
        description: `Menonaktifkan personil ${String((before as { full_name?: string }).full_name || id)} (data tidak dihapus permanen)`,
        before_data: before,
        after_data: { ...(before as object), status: "nonaktif" },
      });
      return ok({ data: { id, archived: true } });
    }
    await remove(RESOURCE_TABLE[resource], id);
    await logActivity({
      actor: session,
      action: "hapus",
      entity_type: resource,
      entity_id: id,
      division_id: divisionId,
      description: `Menghapus data ${resource}: ${String((before as { name?: string; full_name?: string }).name || (before as { full_name?: string }).full_name || id)}`,
      before_data: before,
    });
    return ok({ data: { id } });
  } catch (error) {
    return apiError(error);
  }
}
