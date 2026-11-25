import "server-only";
import { all } from "@/lib/server/db";
import { can } from "@/lib/server/auth";
import type { Bidang, Division, OperatorPermission, Session } from "@/lib/types";

type ScopeAction = "view" | "create" | "edit" | "delete" | "move" | "assign";

const ACTION_KEY: Record<ScopeAction, keyof OperatorPermission> = {
  view: "can_view",
  create: "can_create",
  edit: "can_edit",
  delete: "can_delete",
  move: "can_move",
  assign: "can_manage_assignments",
};

export async function permissionRows(session: Session): Promise<OperatorPermission[]> {
  if (session.role === "admin") return [];
  return (await all<OperatorPermission>("operator_permissions")).filter((p) => p.profile_id === session.userId);
}

export async function scopedBidangIds(session: Session, periodId?: string): Promise<string[] | null> {
  if (session.role === "admin") return null;
  const rows = await permissionRows(session);
  const specific = rows.map((p) => p.bidang_id).filter(Boolean) as string[];
  if (!specific.length) return null;
  const bidangs = await all<Bidang>("bidangs");
  return bidangs
    .filter((b) => specific.includes(b.id) && (!periodId || b.period_id === periodId))
    .map((b) => b.id);
}

export async function scopedDivisionIds(session: Session, periodId?: string): Promise<string[] | null> {
  if (session.role === "admin") return null;
  const rows = await permissionRows(session);
  const specificDivisions = rows.map((p) => p.division_id).filter(Boolean) as string[];
  const specificBidangs = rows.map((p) => p.bidang_id).filter(Boolean) as string[];
  if (!specificDivisions.length && !specificBidangs.length) return null;
  const divisions = await all<Division>("divisions");
  const bidangIds = new Set(specificBidangs);
  return divisions
    .filter((d) => {
      if (periodId && d.period_id !== periodId) return false;
      return specificDivisions.includes(d.id) || Boolean(d.bidang_id && bidangIds.has(d.bidang_id));
    })
    .map((d) => d.id);
}

export async function canAccessBidang(session: Session, bidangId: string, action: ScopeAction): Promise<boolean> {
  if (session.role === "admin") return true;
  if (!bidangId) return false;
  const rows = await permissionRows(session);
  const relevant = rows.filter((p) => p.division_id ? false : (!p.bidang_id || p.bidang_id === bidangId));
  if (!relevant.length) return false;
  return relevant.some((p) => Boolean(p[ACTION_KEY[action]]));
}

export async function canAccessDivision(session: Session, divisionId: string, action: ScopeAction): Promise<boolean> {
  if (session.role === "admin") return true;
  if (!divisionId) return false;
  const division = await all<Division>("divisions").then((rows) => rows.find((d) => d.id === divisionId) || null);
  const rows = await permissionRows(session);
  const relevant = rows.filter((p) => {
    if (p.division_id) return p.division_id === divisionId;
    if (p.bidang_id) return Boolean(division?.bidang_id && p.bidang_id === division.bidang_id);
    return true;
  });
  if (!relevant.length) return false;
  return relevant.some((p) => Boolean(p[ACTION_KEY[action]]));
}

export const ADMIN_ONLY_READ_RESOURCES = ["profiles", "operator_permissions", "backups"];
export const ADMIN_ONLY_RESOURCES = ["profiles", "operator_permissions", "backups", "periods"];

export const RESOURCE_TABLE = {
  periods: "periods",
  bidangs: "bidangs",
  bidang_coordinators: "bidang_coordinators",
  personnel: "personnel",
  divisions: "divisions",
  assignments: "assignments",
  supervisors: "supervisors",
  work_assignments: "work_assignments",
  master_data: "master_data",
  profiles: "profiles",
  operator_permissions: "operator_permissions",
  activity_logs: "activity_logs",
  settings: "settings",
  import_batches: "import_batches",
  import_rows: "import_rows",
  backups: "backups",
} as const;

export type Resource = keyof typeof RESOURCE_TABLE;

export function isResource(value: string): value is Resource {
  return Object.prototype.hasOwnProperty.call(RESOURCE_TABLE, value);
}
