import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { all, bulkInsert, find, insert, nextCode, patch, remove, removeAll, restoreSnapshot, snapshot, supabaseEnabled, uid } from "@/lib/server/db";
import { can, getSession, logActivity, createProfile, updateProfilePassword, verifyProfilePassword } from "@/lib/server/auth";
import { canAccessDivision } from "@/lib/server/access";
import { apiError, fail, ok } from "@/lib/server/http";
import type { Assignment, Division, ImportBatch, Personnel, Period, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) throw new Error("UNAUTHORIZED");
    const { action, payload = {} } = await req.json() as { action: string; payload: Record<string, unknown> };
    const p = payload;

    if (action === "assign_personnel") {
      const divisionId = String(p.division_id || "");
      if (!(await canAccessDivision(session, divisionId, "assign"))) throw new Error("FORBIDDEN");
      const personnelId = String(p.personnel_id || "");
      const periodId = String(p.period_id || "");
      const assignments = await all<Assignment>("assignments");
      const dup = assignments.find((a) => a.personnel_id === personnelId && a.division_id === divisionId && a.period_id === periodId && a.status === "aktif");
      if (dup && !p.force) return fail("DUPLICATE_WARNING: Personil ini sudah memiliki penugasan aktif di bagian tersebut.", 409);
      const created = await insert("assignments", {
        id: uid(),
        personnel_id: personnelId,
        period_id: periodId,
        division_id: divisionId,
        position_name: String(p.position_name || "Anggota"),
        status: "aktif",
        start_date: String(p.start_date || ""),
        end_date: "",
        notes: String(p.notes || ""),
        created_at: new Date().toISOString(),
      });
      await logActivity({ actor: session, action: "tambah_penugasan", entity_type: "assignments", entity_id: String(created.id), division_id: divisionId, period_id: periodId, description: `Menugaskan personil ke bagian`, after_data: created });
      return ok({ data: created });
    }

    if (action === "move_personnel") {
      const assignmentId = String(p.assignment_id || "");
      const targetDivision = String(p.division_id || "");
      if (!(await canAccessDivision(session, targetDivision, "move"))) throw new Error("FORBIDDEN");
      const current = await find<Assignment>("assignments", assignmentId);
      if (!current) return fail("Penugasan tidak ditemukan");
      const updated = await patch("assignments", assignmentId, { end_date: String(p.end_date || new Date().toISOString().slice(0, 10)), status: "selesai" });
      const created = await insert("assignments", {
        id: uid(),
        personnel_id: current.personnel_id,
        period_id: current.period_id,
        division_id: targetDivision,
        position_name: String(p.position_name || current.position_name || "Anggota"),
        status: "aktif",
        start_date: String(p.start_date || new Date().toISOString().slice(0, 10)),
        end_date: "",
        notes: String(p.notes || current.notes || ""),
        created_at: new Date().toISOString(),
      });
      await logActivity({ actor: session, action: "pindah", entity_type: "personnel", entity_id: current.personnel_id, division_id: targetDivision, period_id: current.period_id, description: `Memindahkan personil antarbagian`, before_data: current, after_data: created });
      return ok({ data: created, previous: updated });
    }

    if (action === "end_assignment") {
      const current = await find<Assignment>("assignments", String(p.assignment_id || ""));
      if (!current) return fail("Penugasan tidak ditemukan");
      if (!(await canAccessDivision(session, current.division_id, "assign"))) throw new Error("FORBIDDEN");
      const updated = await patch("assignments", current.id, { status: "selesai", end_date: String(p.end_date || new Date().toISOString().slice(0, 10)) });
      await logActivity({ actor: session, action: "akhiri_penugasan", entity_type: "assignments", entity_id: current.id, division_id: current.division_id, period_id: current.period_id, description: "Mengakhiri penugasan personil", before_data: current, after_data: updated });
      return ok({ data: updated });
    }

    if (action === "merge_personnel") {
      if (session.role !== "admin") throw new Error("FORBIDDEN");
      const sourceIds = (p.source_ids as string[]) || [];
      const targetId = String(p.target_id || "");
      const target = await find<Personnel>("personnel", targetId);
      if (!target || !sourceIds.length) return fail("Data penggabungan tidak lengkap");
      const assignments = await all<Assignment>("assignments");
      let moved = 0;
      for (const sourceId of sourceIds) {
        const source = await find<Personnel>("personnel", sourceId);
        if (!source || sourceId === targetId) continue;
        for (const a of assignments.filter((x) => x.personnel_id === sourceId)) {
          const duplicate = assignments.some((x) => x.id !== a.id && x.personnel_id === targetId && x.division_id === a.division_id && x.period_id === a.period_id && x.status === a.status);
          if (!duplicate) {
            await patch("assignments", a.id, { personnel_id: targetId });
            moved++;
          }
        }
        await patch("personnel", sourceId, { status: "nonaktif", notes: `${source.notes || ""} [Digabung ke ${target.code}]`.trim() });
      }
      await logActivity({ actor: session, action: "gabung_duplikat", entity_type: "personnel", entity_id: targetId, description: `Menggabungkan ${sourceIds.length} data duplikat ke ${target.code}; ${moved} riwayat penugasan dipindahkan`, before_data: { sourceIds }, after_data: { targetId, moved } });
      return ok({ data: { merged: sourceIds.length, assignmentsMoved: moved } });
    }

    if (action === "clone_period") {
      if (session.role !== "admin") throw new Error("FORBIDDEN");
      const sourcePeriodId = String(p.source_period_id || "");
      const source = await find<Period>("periods", sourcePeriodId);
      if (!source) return fail("Periode sumber tidak ditemukan");
      const newId = uid();
      const newPeriod = await insert("periods", {
        id: newId,
        name: String(p.name || `${source.name} (salinan)`),
        year: p.year || Number(source.year) + 1,
        start_date: String(p.start_date || ""),
        end_date: String(p.end_date || ""),
        status: "draft",
        description: `Disalin dari ${source.name}`,
      });
      let copied = 0;
      if (p.copy_divisions !== false) {
        const divisions = (await all<Division>("divisions")).filter((d) => d.period_id === sourcePeriodId);
        for (const d of divisions) {
          await insert("divisions", { ...d, id: uid(), period_id: newId, required_count: p.copy_requirements === false ? 0 : d.required_count, leader_name: p.copy_leaders === false ? "" : d.leader_name, coordinator_name: p.copy_leaders === false ? "" : d.coordinator_name, source_sheet: "", created_at: undefined });
          copied++;
        }
      }
      if (p.copy_supervisors !== false) {
        const supervisors = (await all<{ id: string; period_id: string }>("supervisors")).filter((s) => s.period_id === sourcePeriodId);
        for (const s of supervisors) {
          await insert("supervisors", { ...s, id: uid(), period_id: newId });
        }
      }
      if (p.copy_assignments === true) {
        const assignments = (await all<Assignment>("assignments")).filter((a) => a.period_id === sourcePeriodId);
        const oldToNew = new Map<string, string>();
        const srcDivs = (await all<Division>("divisions")).filter((d) => d.period_id === sourcePeriodId);
        const newDivs = (await all<Division>("divisions")).filter((d) => d.period_id === newId);
        srcDivs.forEach((d, i) => oldToNew.set(d.id, newDivs[i]?.id || ""));
        for (const a of assignments) {
          await insert("assignments", { ...a, id: uid(), period_id: newId, division_id: oldToNew.get(a.division_id) || a.division_id, created_at: new Date().toISOString() });
        }
      }
      await logActivity({ actor: session, action: "salin_periode", entity_type: "periods", entity_id: newId, period_id: newId, description: `Membuat periode baru dari ${source.name} dengan ${copied} divisi`, after_data: newPeriod });
      return ok({ data: newPeriod, divisionsCopied: copied });
    }

    if (action === "create_backup" || action === "restore_backup") {
      if (session.role !== "admin") throw new Error("FORBIDDEN");
      if (action === "create_backup") {
        const snap = await snapshot();
        const fileName = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
        const summary: Record<string, number> = {};
        Object.entries(snap).forEach(([k, v]) => (summary[k] = Array.isArray(v) ? v.length : 0));
        const created = await insert("backups", {
          id: uid(), file_name: fileName, created_by: session.fullName, size: JSON.stringify(snap).length,
          summary, created_at: new Date().toISOString(), snapshot: snap,
        });
        await logActivity({ actor: session, action: "backup", entity_type: "backups", entity_id: String(created.id), description: `Membuat backup database (${fileName})` });
        return ok({ data: { ...created, snapshot: undefined } });
      }
      if (!p.confirm) return fail("Konfirmasi pemulihan diperlukan");
      const backup = await find<{ snapshot: Record<string, unknown[]> }>("backups", String(p.backup_id || ""));
      if (!backup?.snapshot) return fail("Backup tidak ditemukan");
      const before = await snapshot();
      await restoreSnapshot(backup.snapshot);
      await logActivity({ actor: session, action: "pulihkan", entity_type: "backups", entity_id: String(p.backup_id), description: "Memulihkan data dari backup", before_data: before });
      return ok({ data: { success: true } });
    }

    if (action === "delete_all_personnel") {
      if (session.role !== "admin") throw new Error("FORBIDDEN");
      if (p.confirm !== true) return fail("Konfirmasi penghapusan diperlukan");
      const [people, assignmentRows] = await Promise.all([
        all<Personnel>("personnel"),
        all<Assignment>("assignments"),
      ]);
      const snap = await snapshot();
      const backup = await insert("backups", {
        id: uid(),
        file_name: `auto-reset-personil-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
        created_by: session.fullName,
        size: JSON.stringify(snap).length,
        summary: { auto: 1, personnel: people.length, assignments: assignmentRows.length },
        created_at: new Date().toISOString(),
        snapshot: snap,
      });
      const deletedAssignments = await removeAll("assignments");
      const deletedPersonnel = await removeAll("personnel");
      await logActivity({
        actor: session,
        action: "hapus_semua_personil",
        entity_type: "personnel",
        entity_id: "all",
        description: `Menghapus ${deletedPersonnel} personil dan ${deletedAssignments} penugasan. Backup otomatis: ${String(backup.id)}`,
        before_data: { personnel: people.length, assignments: assignmentRows.length, backup_id: String(backup.id) },
        after_data: { personnel: 0, assignments: 0 },
      });
      return ok({ data: { deleted: deletedPersonnel, assignments: deletedAssignments, backup_id: String(backup.id) } });
    }

    if (action === "rollback_import") {
      if (!(await can(session, "import"))) throw new Error("FORBIDDEN");
      const batch = await find<ImportBatch>("import_batches", String(p.batch_id || ""));
      if (!batch || batch.status !== "selesai" || !batch.backup_id) return fail("Batch import tidak dapat dipulihkan");
      const backup = await find<{ snapshot: Record<string, unknown[]> }>("backups", batch.backup_id);
      if (!backup?.snapshot) return fail("Snapshot import tidak ditemukan");
      await restoreSnapshot(backup.snapshot);
      await patch("import_batches", batch.id, { status: "dipulihkan" });
      await logActivity({ actor: session, action: "pulihkan_import", entity_type: "import_batches", entity_id: batch.id, description: `Membatalkan batch import ${batch.file_name}` });
      return ok({ data: { success: true } });
    }

    if (action === "create_account") {
      if (session.role !== "admin") throw new Error("FORBIDDEN");
      const profile = await createProfile({
        username: String(p.username || ""),
        password: String(p.password || ""),
        full_name: String(p.full_name || ""),
        role: p.role === "admin" ? "admin" : "operator",
        email: String(p.email || ""),
      });
      await logActivity({ actor: session, action: "tambah_akun", entity_type: "profiles", entity_id: profile.id, description: `Membuat akun ${profile.username}` });
      return ok({ data: { ...profile, password_hash: undefined } });
    }

    if (action === "change_password") {
      const id = String(p.user_id || session.userId);
      if (session.role !== "admin" && id !== session.userId) throw new Error("FORBIDDEN");
      const newPassword = String(p.password || "");
      if (newPassword.length < 6) return fail("Password minimal 6 karakter");
      if (session.role !== "admin" || id === session.userId) {
        const profile = (await all<Profile>("profiles")).find((x) => x.id === id);
        if (!profile || !(await verifyProfilePassword(profile, String(p.current_password || "")))) {
          return fail("Password lama tidak sesuai");
        }
      }
      await updateProfilePassword(id, newPassword);
      await logActivity({ actor: session, action: "ubah_password", entity_type: "profiles", entity_id: id, description: "Mengubah password akun" });
      return ok({ data: { success: true } });
    }

    if (action === "update_permissions") {
      if (session.role !== "admin") throw new Error("FORBIDDEN");
      const profileId = String(p.profile_id || "");
      const rows = await all<{ id: string; profile_id: string }>("operator_permissions");
      for (const r of rows.filter((x) => x.profile_id === profileId)) await remove("operator_permissions", r.id);
      const scopes = (p.scopes as Record<string, unknown>[]) || [{}];
      for (const scope of scopes) {
        await insert("operator_permissions", {
          id: uid(),
          profile_id: profileId,
          period_id: String(scope.period_id || "") || undefined,
          division_id: String(scope.division_id || "") || undefined,
          can_view: Boolean(scope.can_view),
          can_create: Boolean(scope.can_create),
          can_edit: Boolean(scope.can_edit),
          can_delete: Boolean(scope.can_delete),
          can_move: Boolean(scope.can_move),
          can_manage_assignments: Boolean(scope.can_manage_assignments),
          can_import: Boolean(scope.can_import),
          can_export: Boolean(scope.can_export),
          can_view_reports: Boolean(scope.can_view_reports),
        });
      }
      await logActivity({ actor: session, action: "ubah_hak_akses", entity_type: "operator_permissions", entity_id: profileId, description: `Mengatur hak akses operator (${scopes.length} cakupan)` });
      return ok({ data: { success: true } });
    }

    if (action === "initial_import") {
      if (session.role !== "admin") throw new Error("FORBIDDEN");
      if (supabaseEnabled) throw new Error("Impor data awal tidak tersedia pada mode Supabase; gunakan migrasi database lokal.");
      const seedPath = path.join(process.cwd(), "data", "seed.json");
      if (!fs.existsSync(seedPath)) throw new Error("File data/seed.json tidak ditemukan");
      const seed = JSON.parse(fs.readFileSync(seedPath, "utf8")) as Record<string, unknown[]>;
      const tables = ["periods", "master_data", "divisions", "personnel", "assignments", "supervisors", "work_assignments", "settings"] as const;
      let total = 0;
      for (const t of tables) {
        const existing = await all(t);
        const missing = (seed[t] || []).filter((row) => !existing.some((e) => (e as { id?: string }).id === (row as { id?: string }).id));
        total += await bulkInsert(t, missing as Record<string, unknown>[]);
      }
      await logActivity({ actor: session, action: "import", entity_type: "import", description: `Import data awal spreadsheet (${total} baris)` });
      return ok({ data: { imported: total } });
    }

    if (action === "check_duplicates") {
      const rows = await all<Personnel>("personnel");
      const groups = new Map<string, Personnel[]>();
      for (const p of rows) {
        const key = [p.full_name.toLowerCase().replace(/\s+/g, " "), (p.phone || "").replace(/\D/g, ""), (p.korwil || p.origin || "").toLowerCase()].filter(Boolean).join("|");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(p);
      }
      const duplicates = [...groups.entries()].filter(([, v]) => v.length > 1).map(([key, v]) => ({ key, items: v }));
      const nameGroups = new Map<string, Personnel[]>();
      for (const p of rows) {
        const key = p.full_name.toLowerCase().replace(/\s+/g, " ");
        if (!nameGroups.has(key)) nameGroups.set(key, []);
        nameGroups.get(key)!.push(p);
      }
      const possible = [...nameGroups.entries()]
        .filter(([, v]) => v.length > 1)
        .map(([key, v]) => ({ key, items: v }))
        .filter((g) => !duplicates.some((d) => d.key.split("|")[0] === g.key));
      return ok({ data: { exact: duplicates.slice(0, 100), possible: possible.slice(0, 100), exactCount: duplicates.length, possibleCount: possible.length } });
    }

    return fail("Aksi tidak dikenal");
  } catch (error) {
    return apiError(error);
  }
}
