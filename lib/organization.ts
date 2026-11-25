import type { Assignment, Bidang, BidangCoordinator, Division, DivisionStat, Personnel } from "@/lib/types";
import { divisionStats } from "@/lib/utils";

const keyFor = (id: string | undefined, name: string | undefined) => {
  const normalized = String(name || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return id ? `id:${id}` : normalized ? `name:${normalized}` : "";
};

export function coordinatorLabel(c: BidangCoordinator, personnel: Personnel[] = []): string {
  if (c.personnel_id) {
    const person = personnel.find((p) => p.id === c.personnel_id);
    if (person) return person.full_name;
  }
  return c.name || "";
}

export function leaderLabel(d: Division, personnel: Personnel[] = []): string {
  if (d.leader_personnel_id) {
    const person = personnel.find((p) => p.id === d.leader_personnel_id);
    if (person) return person.full_name;
  }
  return d.leader_name || "";
}

export function organizationStats(
  bidangs: Bidang[],
  coordinators: BidangCoordinator[],
  divisions: Division[],
  assignments: Assignment[],
  personnel: Personnel[] = [],
  periodId?: string,
  includeArchived = false,
) {
  const scopedBidangs = periodId ? bidangs.filter((b) => b.period_id === periodId) : bidangs;
  const bidangIds = new Set(scopedBidangs.map((b) => b.id));
  const scopedDivisions = divisions.filter(
    (d) => (!periodId || d.period_id === periodId) && (includeArchived || !d.is_archived) && (!periodId || bidangIds.has(String(d.bidang_id || ""))),
  );
  const scopedCoordinators = coordinators.filter((c) => bidangIds.has(c.bidang_id) && c.is_active !== false);
  const divisionIds = new Set(scopedDivisions.map((d) => d.id));
  const scopedAssignments = assignments.filter((a) => divisionIds.has(a.division_id) && a.status === "aktif");

  const coordinatorKeys = new Set(scopedCoordinators.map((c) => keyFor(c.personnel_id, coordinatorLabel(c, personnel))).filter(Boolean));
  const leaderKeys = new Set(scopedDivisions.map((d) => keyFor(d.leader_personnel_id, leaderLabel(d, personnel))).filter(Boolean));
  const stats: DivisionStat[] = divisionStats(scopedDivisions, assignments, periodId);
  const activeByDivision = new Map(stats.map((s) => [s.division.id, s.active]));
  const withoutLeader = scopedDivisions.filter((d) => !leaderLabel(d, personnel));
  const withoutMembers = scopedDivisions.filter((d) => !activeByDivision.get(d.id));

  const byBidang = scopedBidangs
    .slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name))
    .map((bidang) => {
      const divisionRows = stats.filter((s) => s.division.bidang_id === bidang.id);
      const rows = scopedCoordinators.filter((c) => c.bidang_id === bidang.id);
      const memberIds = new Set(
        scopedAssignments.filter((a) => divisionRows.some((s) => s.division.id === a.division_id)).map((a) => a.personnel_id),
      );
      return {
        bidang,
        coordinators: rows,
        divisions: divisionRows,
        totalDivisi: divisionRows.length,
        totalKetuaDivisi: divisionRows.filter((s) => Boolean(leaderLabel(s.division, personnel))).length,
        totalAnggota: memberIds.size,
        tanpaKetua: divisionRows.filter((s) => !leaderLabel(s.division, personnel)).length,
        tanpaAnggota: divisionRows.filter((s) => !s.active).length,
      };
    });

  return {
    totalBidang: scopedBidangs.length,
    totalDivisi: scopedDivisions.length,
    totalKoordinator: coordinatorKeys.size,
    totalKetuaDivisi: leaderKeys.size,
    totalAnggota: new Set(scopedAssignments.map((a) => a.personnel_id)).size,
    tanpaKetua: withoutLeader,
    tanpaAnggota: withoutMembers,
    stats,
    byBidang,
  };
}
