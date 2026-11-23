import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const SEED_FILE = path.join(ROOT, "data", "seed.json");

const uid = (label) => {
  const h = crypto.createHash("sha256").update(String(label)).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

function readEnv(file) {
  const target = path.join(ROOT, file);
  if (!fs.existsSync(target)) return {};
  const out = {};
  for (const line of fs.readFileSync(target, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    out[match[1]] = value;
  }
  return out;
}

const env = { ...readEnv(".env"), ...readEnv(".env.local"), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !serviceKey) {
  console.error("Supabase belum terkonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY pada .env.local.");
  process.exit(1);
}
if (!fs.existsSync(SEED_FILE)) {
  console.error("data/seed.json tidak ditemukan. Jalankan npm run seed terlebih dahulu.");
  process.exit(1);
}

const seed = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const OPERATOR_ID = "00000000-0000-4000-8000-000000000002";
const profiles = [
  {
    id: ADMIN_ID,
    username: "admin",
    email: "admin@pendataan.local",
    full_name: "Administrator",
    role: "admin",
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: OPERATOR_ID,
    username: "operator",
    email: "operator@pendataan.local",
    full_name: "Operator Pendataan",
    role: "operator",
    is_active: true,
    created_at: new Date().toISOString(),
  },
];

const payload = {
  periods: (seed.periods || []).map((row) => ({ ...row, year: String(row.year ?? "") })),
  profiles,
  master_data: seed.master_data || [],
  divisions: seed.divisions || [],
  personnel: seed.personnel || [],
  assignments: seed.assignments || [],
  supervisors: seed.supervisors || [],
  work_assignments: seed.work_assignments || [],
  settings: (seed.settings || []).map((row) => ({ id: uid(`setting:${row.key}`), ...row })),
  operator_permissions: [
    {
      id: uid("operator-permission:default"),
      profile_id: OPERATOR_ID,
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
  ],
  backups: seed.backups || [],
  activity_logs: seed.activity_logs || [],
  import_batches: seed.import_batches || [],
  import_rows: seed.import_rows || [],
};

const tableOrder = [
  "periods",
  "profiles",
  "master_data",
  "divisions",
  "personnel",
  "assignments",
  "supervisors",
  "work_assignments",
  "settings",
  "operator_permissions",
  "backups",
  "activity_logs",
  "import_batches",
  "import_rows",
];

const conflictKeys = { settings: "key" };
const CHUNK = 250;
const chunks = (rows) => {
  const out = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
};

async function ensureAuthUser(profile) {
  const password = profile.username === "admin"
    ? env.SEED_ADMIN_PASSWORD
    : env.SEED_OPERATOR_PASSWORD;
  if (!password || password === "SET_A_LONG_RANDOM_PASSWORD") {
    throw new Error(`Atur password kuat SEED_${profile.username.toUpperCase()}_PASSWORD sebelum membuat akun Supabase.`);
  }
  const { data, error } = await supabase.auth.admin.getUserById(profile.id);
  if (!error && data.user) return false;
  const created = await supabase.auth.admin.createUser({
    id: profile.id,
    email: profile.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: profile.full_name, role: profile.role },
  });
  if (created.error) throw new Error(`Gagal membuat auth user ${profile.username}: ${created.error.message}`);
  return true;
}

async function main() {
  let authCreated = 0;
  for (const profile of profiles) {
    if (await ensureAuthUser(profile)) authCreated++;
  }

  const report = {};
  for (const table of tableOrder) {
    const rows = payload[table];
    if (!rows.length) {
      report[table] = 0;
      continue;
    }
    const onConflict = conflictKeys[table] || "id";
    for (const batch of chunks(rows)) {
      const { error } = await supabase.from(table).upsert(batch, { onConflict });
      if (error) throw new Error(`Gagal mengisi ${table}: ${error.message}`);
    }
    report[table] = rows.length;
  }

  const counts = {};
  for (const table of tableOrder) {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) throw new Error(`Gagal menghitung ${table}: ${error.message}`);
    counts[table] = count;
  }

  console.log(JSON.stringify({ mode: "supabase", seed: "data/seed.json", auth_users_created: authCreated, upserted: report, counts }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
