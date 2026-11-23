export type Role = "admin" | "operator";

export interface Session {
  userId: string;
  username: string;
  fullName: string;
  role: Role;
  accessToken?: string;
}

export interface Period {
  id: string;
  name: string;
  year: number | string;
  start_date: string;
  end_date: string;
  status: "draft" | "aktif" | "selesai" | "arsip";
  description: string;
  source_file?: string;
  created_at?: string;
}

export interface Personnel {
  id: string;
  code: string;
  full_name: string;
  gender?: string;
  birth_place?: string;
  birth_date?: string;
  origin?: string;
  korwil?: string;
  phone?: string;
  phone_raw?: string;
  address?: string;
  status: "aktif" | "nonaktif";
  notes?: string;
  source_file?: string;
  source_sheet?: string;
  source_row?: number;
  fingerprint?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Division {
  id: string;
  period_id: string;
  code: string;
  name: string;
  alias?: string;
  category?: string;
  leader_name?: string;
  coordinator_name?: string;
  required_count: number;
  notes?: string;
  sort_order?: number;
  source_file?: string;
  source_sheet?: string;
  is_active: boolean;
}

export interface Assignment {
  id: string;
  personnel_id: string;
  period_id: string;
  division_id: string;
  position_id?: string;
  position_name: string;
  start_date?: string;
  end_date?: string;
  status: "aktif" | "selesai" | "dihentikan";
  notes?: string;
  source_file?: string;
  source_sheet?: string;
  source_row?: number;
  created_at?: string;
}

export interface Supervisor {
  id: string;
  period_id: string;
  name: string;
  group_name: string;
  phone?: string;
  notes?: string;
  status: "aktif" | "nonaktif";
  source_file?: string;
  source_sheet?: string;
}

export interface WorkAssignment {
  id: string;
  supervisor_id: string;
  period_id: string;
  name: string;
  notes?: string;
  status: "aktif" | "nonaktif";
  source_file?: string;
  source_sheet?: string;
  source_row?: number;
}

export interface MasterData {
  id: string;
  type: string;
  value: string;
  is_active: boolean;
  sort_order?: number;
}

export interface OperatorPermission {
  id: string;
  profile_id: string;
  period_id?: string;
  division_id?: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_move: boolean;
  can_manage_assignments: boolean;
  can_import: boolean;
  can_export: boolean;
  can_view_reports: boolean;
}

export interface Profile {
  id: string;
  username: string;
  email?: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  password_hash?: string;
  created_at?: string;
}

export interface ActivityLog {
  id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  period_id?: string;
  division_id?: string;
  before_data?: unknown;
  after_data?: unknown;
  description: string;
  created_at: string;
}

export interface ImportBatch {
  id: string;
  file_name: string;
  period_id: string;
  created_by: string;
  status: "preview" | "selesai" | "dibatalkan" | "dipulihkan";
  summary?: Record<string, number>;
  backup_id?: string;
  created_at: string;
}

export interface ImportRow {
  id: string;
  batch_id: string;
  status: "berhasil" | "duplikat" | "perlu_diperiksa" | "tidak_valid" | "dilewati";
  raw_data: Record<string, unknown>;
  mapped_data: Record<string, unknown>;
  message: string;
  source_sheet: string;
  source_row: number;
  created_at?: string;
}

export interface Backup {
  id: string;
  file_name: string;
  created_by: string;
  size: number;
  summary?: Record<string, number>;
  created_at: string;
  snapshot?: Record<string, unknown[]>;
}

export interface AppSetting {
  key: string;
  value: string;
}

export interface Database {
  periods: Period[];
  profiles: Profile[];
  master_data: MasterData[];
  divisions: Division[];
  personnel: Personnel[];
  assignments: Assignment[];
  supervisors: Supervisor[];
  work_assignments: WorkAssignment[];
  operator_permissions: OperatorPermission[];
  activity_logs: ActivityLog[];
  import_batches: ImportBatch[];
  import_rows: ImportRow[];
  backups: Backup[];
  settings: AppSetting[];
}

export type TableName = keyof Database;

export interface DivisionStat {
  division: Division;
  registered: number;
  active: number;
  required: number;
  lacking: number;
  excess: number;
}
