import type { Assignment, Division, DivisionStat, Personnel } from "@/lib/types";

export function divisionStats(divisions: Division[], assignments: Assignment[], periodId?: string): DivisionStat[] {
  const scoped = periodId ? divisions.filter((d) => d.period_id === periodId) : divisions;
  return scoped.map((division) => {
    const rows = assignments.filter(
      (a) => a.division_id === division.id && (!periodId || a.period_id === periodId) && a.status === "aktif",
    );
    const unique = new Set(rows.map((a) => a.personnel_id));
    const active = unique.size;
    const required = Number(division.required_count) || 0;
    return {
      division,
      registered: new Set(assignments.filter((a) => a.division_id === division.id).map((a) => a.personnel_id)).size,
      active,
      required,
      lacking: Math.max(0, required - active),
      excess: Math.max(0, active - required),
    };
  });
}

export function dashboardNumbers(divisions: Division[], assignments: Assignment[], personnel: Personnel[], periodId?: string) {
  const stats = divisionStats(divisions, assignments, periodId);
  const scopedAssignments = periodId ? assignments.filter((a) => a.period_id === periodId) : assignments;
  const assignedIds = new Set(scopedAssignments.filter((a) => a.status === "aktif").map((a) => a.personnel_id));
  const scopedPersonnel = periodId ? personnel : personnel;
  return {
    totalPersonnel: scopedPersonnel.length,
    activePersonnel: scopedPersonnel.filter((p) => p.status === "aktif").length,
    unassigned: scopedPersonnel.filter((p) => p.status === "aktif" && !assignedIds.has(p.id)).length,
    totalDivisions: stats.length,
    totalRequired: stats.reduce((s, d) => s + d.required, 0),
    totalLacking: stats.reduce((s, d) => s + d.lacking, 0),
    totalExcess: stats.reduce((s, d) => s + d.excess, 0),
    stats,
  };
}

export const formatNumber = (n: number) => new Intl.NumberFormat("id-ID").format(n || 0);
export const formatDate = (value?: string) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(d);
};
export const formatDateTime = (value?: string) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(d);
};

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 9 && digits.length <= 13 && digits.startsWith("8")) return "0" + digits;
  return digits;
}

export function duplicateKey(p: { full_name?: string; phone?: string; korwil?: string; origin?: string }) {
  const clean = (v?: string) => (v || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return [clean(p.full_name), normalizePhone(p.phone || ""), clean(p.korwil || p.origin)].filter(Boolean).join("|");
}

export const STATUS_LABELS: Record<string, string> = {
  aktif: "Aktif",
  nonaktif: "Nonaktif",
  draft: "Draft",
  selesai: "Selesai",
  arsip: "Arsip",
  dihentikan: "Dihentikan",
  perlu_diperiksa: "Perlu diperiksa",
  tidak_valid: "Tidak valid",
  dilewati: "Dilewati",
  duplikat: "Duplikat",
  berhasil: "Berhasil",
};

export function badgeClass(status: string) {
  const s = status.toLowerCase();
  if (["aktif", "berhasil", "selesai"].includes(s)) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (["nonaktif", "dihentikan", "tidak_valid", "arsip"].includes(s)) return "bg-slate-100 text-slate-600 ring-slate-200";
  if (["draft", "perlu_diperiksa", "duplikat"].includes(s)) return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-blue-50 text-blue-700 ring-blue-200";
}
