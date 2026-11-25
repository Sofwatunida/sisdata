import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, TableName } from "@/lib/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
export const supabaseEnabled = Boolean(url && serviceKey);

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (!client) client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const hashPassword = (password: string) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
};

const defaultProfiles = () => [
  {
    id: "00000000-0000-4000-8000-000000000001",
    username: "admin",
    full_name: "Administrator",
    role: "admin" as const,
    is_active: true,
    password_hash: hashPassword("admin123"),
    created_at: new Date().toISOString(),
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    username: "operator",
    full_name: "Operator Pendataan",
    role: "operator" as const,
    is_active: true,
    password_hash: hashPassword("operator123"),
    created_at: new Date().toISOString(),
  },
];

declare global {
  // eslint-disable-next-line no-var
  var __personnelDb: Database | undefined;
}

function freshLocal(): Database {
  const seedData = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "seed.json"), "utf8")) as Database;
  const db = JSON.parse(JSON.stringify(seedData)) as Database;
  db.bidangs ||= [];
  db.bidang_coordinators ||= [];
  db.profiles = defaultProfiles();
  db.operator_permissions = [
    {
      id: crypto.randomUUID(),
      profile_id: db.profiles[1].id,
      can_view: true,
      can_create: true,
      can_edit: true,
      can_delete: false,
      can_move: true,
      can_manage_assignments: true,
      can_import: false,
      can_export: true,
      can_view_reports: true,
    },
  ];
  return db;
}

function local(): Database {
  if (!globalThis.__personnelDb) {
    if (process.env.VERCEL === "1") {
      throw new Error("Supabase wajib dikonfigurasi sebelum aplikasi dijalankan di Vercel");
    }
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      try {
        globalThis.__personnelDb = JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as Database;
        globalThis.__personnelDb.bidangs ||= [];
        globalThis.__personnelDb.bidang_coordinators ||= [];
      } catch {
        globalThis.__personnelDb = freshLocal();
      }
    } else {
      globalThis.__personnelDb = freshLocal();
      persist();
    }
  }
  return globalThis.__personnelDb!;
}

function persist() {
  if (!globalThis.__personnelDb) return;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(globalThis.__personnelDb), "utf8");
  fs.renameSync(tmp, DB_FILE);
}

export const uid = () => crypto.randomUUID();

export async function all<T = Record<string, unknown>>(table: TableName): Promise<T[]> {
  if (supabaseEnabled) {
    const { data, error } = await supabase().from(table).select("*");
    if (error) throw new Error(error.message);
    return (data || []) as T[];
  }
  return JSON.parse(JSON.stringify(local()[table] || [])) as T[];
}

export async function find<T = Record<string, unknown>>(table: TableName, id: string): Promise<T | null> {
  if (supabaseEnabled) {
    const { data, error } = await supabase().from(table).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as T) || null;
  }
  return (local()[table] as unknown[]).find((r) => (r as { id?: string }).id === id) as T || null;
}

export async function insert<T = Record<string, unknown>>(table: TableName, row: Record<string, unknown>): Promise<T> {
  const payload: Record<string, unknown> = { ...row };
  if (!payload.id) payload.id = uid();
  if (supabaseEnabled) {
    const { data, error } = await supabase().from(table).insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    return data as T;
  }
  (local()[table] as unknown[]).push(payload);
  persist();
  return payload as T;
}

export async function bulkInsert(table: TableName, rows: Record<string, unknown>[]): Promise<number> {
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({ id: r.id || uid(), ...r }));
  if (supabaseEnabled) {
    const { error } = await supabase().from(table).insert(payload);
    if (error) throw new Error(error.message);
    return payload.length;
  }
  (local()[table] as unknown[]).push(...payload);
  persist();
  return payload.length;
}

export async function patch<T = Record<string, unknown>>(table: TableName, id: string, changes: Record<string, unknown>): Promise<T | null> {
  if (supabaseEnabled) {
    const { data, error } = await supabase().from(table).update(changes).eq("id", id).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return (data as T) || null;
  }
  const row = (local()[table] as unknown as Record<string, unknown>[]).find((r) => r.id === id);
  if (!row) return null;
  Object.assign(row, changes);
  persist();
  return row as unknown as T;
}

export async function remove(table: TableName, id: string): Promise<boolean> {
  if (supabaseEnabled) {
    const { error } = await supabase().from(table).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  }
  const db = local();
  const list = db[table] as unknown as Record<string, unknown>[];
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return false;
  list.splice(idx, 1);
  persist();
  return true;
}

export async function removeAll(table: TableName): Promise<number> {
  if (supabaseEnabled) {
    const { count, error } = await supabase().from(table).select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    if (!count) return 0;
    const { error: deleteError } = await supabase().from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (deleteError) throw new Error(deleteError.message);
    return count;
  }
  const db = local();
  const list = (db[table] as unknown[]) || [];
  const count = list.length;
  (db[table] as unknown[]) = [];
  persist();
  return count;
}

export async function removeWhere(table: TableName, predicate: (row: Record<string, unknown>) => boolean): Promise<number> {
  if (supabaseEnabled) throw new Error("removeWhere tidak didukung pada mode Supabase");
  const db = local();
  const list = db[table] as unknown as Record<string, unknown>[];
  const keep = list.filter((r) => !predicate(r));
  const count = list.length - keep.length;
  (db as unknown as Record<string, unknown[]>)[table] = keep;
  persist();
  return count;
}

export async function snapshot(): Promise<Record<string, unknown[]>> {
  const tables: TableName[] = [
    "periods", "profiles", "master_data", "bidangs", "bidang_coordinators", "divisions", "personnel",
    "assignments", "supervisors", "work_assignments", "operator_permissions", "activity_logs",
    "import_batches", "import_rows", "settings",
  ];
  const out: Record<string, unknown[]> = {};
  for (const t of tables) out[t] = await all(t);
  return out;
}

export async function restoreSnapshot(snap: Record<string, unknown[]>): Promise<void> {
  if (supabaseEnabled) {
    const { error } = await supabase().rpc("restore_app_snapshot", { p_snapshot: snap });
    if (error) throw new Error(error.message);
    return;
  }
  const tables: TableName[] = [
    "periods", "profiles", "master_data", "bidangs", "bidang_coordinators", "divisions", "personnel",
    "assignments", "supervisors", "work_assignments", "operator_permissions", "activity_logs",
    "import_batches", "import_rows", "settings",
  ];
  const db = local();
  for (const t of tables) {
    if (!Array.isArray(snap[t])) continue;
    (db[t] as unknown[]) = JSON.parse(JSON.stringify(snap[t]));
  }
  persist();
}

export async function nextCode(table: "personnel" | "divisions" | "periods", prefix: string, digits = 4): Promise<string> {
  const rows = await all<{ code?: string }>(table);
  let max = 0;
  for (const r of rows) {
    const m = new RegExp(`^${prefix}-(\\d+)$`).exec(r.code || "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(digits, "0")}`;
}

export async function getSetting(key: string): Promise<string> {
  const rows = await all<{ key: string; value: string }>("settings");
  return rows.find((r) => r.key === key)?.value || "";
}

export async function setSetting(key: string, value: string): Promise<void> {
  const rows = await all<{ id?: string; key: string; value: string }>("settings");
  const existing = rows.find((r) => r.key === key);
  if (existing) await patch("settings", existing.id!, { value });
  else await insert("settings", { key, value });
}

export { hashPassword };
export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split(":");
    if (scheme !== "scrypt") return false;
    const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

export async function resetLocalDatabase() {
  if (supabaseEnabled) throw new Error("Reset hanya tersedia pada mode lokal");
  globalThis.__personnelDb = freshLocal();
  persist();
}
