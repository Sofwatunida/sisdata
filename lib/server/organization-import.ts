import { all, find, insert, nextCode, patch, removeWhere, setSetting, uid } from "@/lib/server/db";
import { logActivity } from "@/lib/server/auth";
import { findLinkedPersonnel } from "@/lib/server/personnel-link";
import { normalizeDivisionName } from "@/lib/utils";
import type { Bidang, BidangCoordinator, Division, Period, Session } from "@/lib/types";

export type OrganizationStructure = {
  period: { name: string; year: string; status: string; description: string; source_file: string };
  source_file: string;
  source_sheet: string;
  fields: {
    name: string;
    sort_order: number;
    coordinators: { name: string; phone: string; notes: string; sort_order: number }[];
    divisions: { name: string; leader_name: string; leader_phone: string; notes: string; sort_order: number; source_row: number }[];
  }[];
};

export async function replaceOrganizationStructure(structure: OrganizationStructure, periodId: string, actor: Session) {
  const period = await find<Period>("periods", periodId);
  if (!period) throw new Error("Periode tujuan tidak ditemukan");

  const activeDivisions = (await all<Division>("divisions")).filter((d) => d.period_id === periodId && !d.is_archived);
  for (const division of activeDivisions) {
    await patch("divisions", division.id, { is_archived: true, archived_at: new Date().toISOString() });
  }
  const oldBidangs = (await all<Bidang>("bidangs")).filter((b) => b.period_id === periodId);
  const oldBidangIds = new Set(oldBidangs.map((b) => b.id));
  await removeWhere("bidang_coordinators", (row) => oldBidangIds.has(String(row.bidang_id || "")));
  await removeWhere("bidangs", (row) => String(row.period_id || "") === periodId);

  let codeNumber = Number(String(await nextCode("divisions", "DIV", 3)).split("-")[1]) || 1;
  let linkedPersonnel = 0;
  let coordinatorCount = 0;
  let divisionCount = 0;
  const sourceFile = structure.source_file || structure.period.source_file;

  for (const field of structure.fields) {
    const bidang = await insert<Bidang>("bidangs", {
      id: uid(),
      period_id: periodId,
      name: normalizeDivisionName(field.name),
      notes: "",
      sort_order: Number(field.sort_order) || 0,
      source_file: sourceFile,
      source_sheet: structure.source_sheet,
      created_at: new Date().toISOString(),
    });
    const bidangId = String(bidang.id);
    let primaryCoordinator = "";
    for (const coordinator of field.coordinators || []) {
      const name = String(coordinator.name || "");
      const phone = String(coordinator.phone || "");
      const personnelId = await findLinkedPersonnel(name, phone);
      if (personnelId) linkedPersonnel++;
      if (!primaryCoordinator && name) primaryCoordinator = name;
      await insert<BidangCoordinator>("bidang_coordinators", {
        id: uid(),
        bidang_id: bidangId,
        personnel_id: personnelId || null,
        name,
        phone,
        notes: String(coordinator.notes || ""),
        sort_order: Number(coordinator.sort_order) || 0,
        is_active: true,
        created_at: new Date().toISOString(),
      });
      coordinatorCount++;
    }
    for (const division of field.divisions || []) {
      const leaderName = String(division.leader_name || "");
      const leaderPhone = String(division.leader_phone || "");
      const leaderPersonnelId = await findLinkedPersonnel(leaderName, leaderPhone);
      if (leaderPersonnelId) linkedPersonnel++;
      await insert<Division>("divisions", {
        id: uid(),
        period_id: periodId,
        bidang_id: bidangId,
        code: `DIV-${String(codeNumber++).padStart(3, "0")}`,
        name: normalizeDivisionName(division.name),
        leader_name: leaderName,
        leader_personnel_id: leaderPersonnelId || null,
        leader_phone: leaderPhone,
        coordinator_name: primaryCoordinator,
        required_count: 0,
        notes: String(division.notes || ""),
        sort_order: Number(division.sort_order) || 0,
        source_file: sourceFile,
        source_sheet: structure.source_sheet,
        source_row: Number(division.source_row) || 0,
        is_active: true,
        is_archived: false,
      });
      divisionCount++;
    }
  }

  await setSetting("active_period_id", periodId);
  await logActivity({
    actor,
    action: "replace_struktur",
    entity_type: "periods",
    entity_id: periodId,
    period_id: periodId,
    description: `Impor PDF ${sourceFile} ke ${period.name}: ${structure.fields.length} bidang, ${coordinatorCount} koordinator, ${divisionCount} divisi`,
    after_data: {
      archived_divisi: activeDivisions.length,
      bidangs: structure.fields.length,
      coordinators: coordinatorCount,
      divisions: divisionCount,
      linkedPersonnel,
    },
  });

  return {
    period: { id: String(period.id), name: String(period.name || "") },
    archivedDivisions: activeDivisions.length,
    bidangs: structure.fields.length,
    coordinators: coordinatorCount,
    divisions: divisionCount,
    linkedPersonnel,
  };
}
