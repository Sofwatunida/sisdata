import "server-only";
import { all } from "@/lib/server/db";
import { can } from "@/lib/server/auth";
import type { OperatorPermission, Session } from "@/lib/types";

export async function permissionRows(session: Session): Promise<OperatorPermission[]> {
  if (session.role === "admin") return [];
  return (await all<OperatorPermission>("operator_permissions")).filter((p) => p.profile_id === session.userId);
}

export async function scopedDivisionIds(session: Session, periodId?: string): Promise<string[] | null> {
  if (session.role === "admin") return null;
  const rows = await permissionRows(session);
  const specific = rows.map((p) => p.division_id).filter(Boolean) as string[];
  if (!specific.length) return null;
  const divisions = await all<{ id: string; period_id: string }>("divisions");
  return divisions
    .filter((d) => specific.includes(d.id) && (!periodId || d.period_id === periodId))
    .map((d) => d.id);
}

export async function canAccessDivision(session: Session, divisionId: string, action: "view" | "create" | "edit" | "delete" | "move" | "assign"): Promise<boolean> {
  if (session.role === "admin") return true;
  const rows = await permissionRows(session);
  const relevant = rows.filter((p) => !p.division_id || p.division_id === divisionId);
  if (!relevant.length) return false;
  const key = {
    view: "can_view",
    create: "can_create",
    edit: "can_edit",
    delete: "can_delete",
    move: "can_move",
    assign: "can_manage_assignments",
  }[action] as keyof OperatorPermission;
  return relevant.some((p) => Boolean(p[key]));
}

export const ADMIN_ONLY_READ_RESOURCES = ["profiles", "operator_permissions", "backups"];
export const ADMIN_ONLY_RESOURCES = ["profiles", "operator_permissions", "backups", "periods"];

export const RESOURCE_TABLE = {
  periods: "periods",
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
