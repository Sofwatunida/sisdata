import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const LOCAL_DB_FILE = path.join(ROOT, ".data", "db.json");
const CREDENTIALS_FILE = path.join(ROOT, ".data", "supabase-migration-credentials.json");
const BATCH_SIZE = 250;
const TABLES = [
  "periods",
  "profiles",
  "master_data",
  "divisions",
  "personnel",
  "supervisors",
  "assignments",
  "work_assignments",
  "settings",
  "operator_permissions",
  "activity_logs",
  "backups",
  "import_batches",
  "import_rows",
];
const FOREIGN_KEYS = [
  ["divisions", "period_id", "periods"],
  ["personnel", "period_id", "periods"],
  ["assignments", "personnel_id", "personnel"],
  ["assignments", "period_id", "periods"],
  ["assignments", "division_id", "divisions"],
  ["supervisors", "period_id", "periods"],
  ["work_assignments", "supervisor_id", "supervisors"],
  ["work_assignments", "period_id", "periods"],
  ["operator_permissions", "profile_id", "profiles"],
  ["operator_permissions", "period_id", "periods"],
  ["operator_permissions", "division_id", "divisions"],
  ["activity_logs", "actor_id", "profiles"],
  ["import_batches", "period_id", "periods"],
  ["import_batches", "backup_id", "backups"],
  ["import_rows", "batch_id", "import_batches"],
];
const REQUIRED_FOREIGN_KEYS = new Set([
  "assignments.personnel_id",
  "assignments.division_id",
  "work_assignments.supervisor_id",
  "operator_permissions.profile_id",
  "import_rows.batch_id",
]);
const OPTIONAL_UUID_FIELDS = {
  divisions: ["period_id"],
  assignments: ["period_id"],
  supervisors: ["period_id"],
  work_assignments: ["period_id"],
  operator_permissions: ["period_id", "division_id"],
  activity_logs: ["actor_id", "period_id", "division_id"],
  import_batches: ["period_id", "backup_id"],
};

function readEnv(file) {
  const target = path.join(ROOT, file);
  if (!fs.existsSync(target)) return {};
  const values = {};
  for (const line of fs.readFileSync(target, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

function stableUuid(value) {
  const hash = crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function loadLocalDatabase() {
  if (!fs.existsSync(LOCAL_DB_FILE)) {
    throw new Error("Database lokal tidak ditemukan: .data/db.json");
  }
  const database = JSON.parse(fs.readFileSync(LOCAL_DB_FILE, "utf8"));
  for (const table of TABLES) {
    if (!Array.isArray(database[table])) throw new Error(`Tabel lokal ${table} tidak valid atau tidak ditemukan.`);
  }
  return database;
}

function mapTable(table, rows) {
  return rows.map((row, index) => {
    const mapped = { ...row };
    if (table === "settings" && !mapped.id) {
      mapped.id = stableUuid(`setting:${mapped.key}`);
    } else if (!mapped.id) {
      throw new Error(`Baris ${table}[${index}] tidak memiliki ID; migrasi dihentikan agar identitas data tidak berubah.`);
    }

    if (table === "periods") mapped.year = String(mapped.year ?? "");
    if (table === "profiles") {
      mapped.email = String(mapped.email || `${mapped.username}@pendataan.local`).trim().toLowerCase();
      delete mapped.password_hash;
    }
    for (const field of OPTIONAL_UUID_FIELDS[table] || []) {
      if (mapped[field] === "") mapped[field] = null;
    }
    if (table === "backups" && mapped.snapshot && Array.isArray(mapped.snapshot.profiles)) {
      mapped.snapshot.profiles = mapped.snapshot.profiles.map((profile) => {
        const { password_hash: _passwordHash, ...safeProfile } = profile;
        return safeProfile;
      });
    }
    return mapped;
  });
}

function validateDatabase(database, rowsByTable) {
  for (const table of TABLES) {
    const ids = new Set();
    for (const [index, row] of rowsByTable[table].entries()) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)) {
        throw new Error(`ID pada ${table}[${index}] bukan UUID yang valid.`);
      }
      if (ids.has(row.id)) throw new Error(`ID duplikat pada tabel ${table}.`);
      ids.add(row.id);
    }
  }

  const usernames = new Set();
  const emails = new Set();
  for (const profile of rowsByTable.profiles) {
    const username = String(profile.username || "").trim().toLowerCase();
    const email = String(profile.email || "").trim().toLowerCase();
    if (!username || !email) throw new Error("Setiap profil harus memiliki username dan email.");
    if (usernames.has(username)) throw new Error(`Username profil duplikat: ${username}.`);
    if (emails.has(email)) throw new Error(`Email profil duplikat: ${email}.`);
    usernames.add(username);
    emails.add(email);
  }

  for (const [sourceTable, field, targetTable] of FOREIGN_KEYS) {
    const targetIds = new Set(rowsByTable[targetTable].map((row) => row.id));
    for (const [index, row] of rowsByTable[sourceTable].entries()) {
      if (REQUIRED_FOREIGN_KEYS.has(`${sourceTable}.${field}`) && !row[field]) {
        throw new Error(`Relasi wajib ${sourceTable}[${index}].${field} kosong.`);
      }
      if (row[field] && !targetIds.has(row[field])) {
        throw new Error(`Relasi ${sourceTable}[${index}].${field} tidak ditemukan pada ${targetTable}.`);
      }
    }
  }

  const periodIds = new Set(database.periods.map((row) => row.id));
  for (const permission of rowsByTable.operator_permissions) {
    if (permission.period_id && !periodIds.has(permission.period_id)) {
      throw new Error(`Cakupan periode pada izin operator ${permission.id} tidak ditemukan.`);
    }
  }
}

function countReport(rowsByTable) {
  return Object.fromEntries(TABLES.map((table) => [table, rowsByTable[table].length]));
}

function loadOrCreateCredentials(projectUrl, profiles) {
  let saved;
  if (fs.existsSync(CREDENTIALS_FILE)) {
    saved = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf8"));
    if (saved.projectUrl !== projectUrl) saved = undefined;
  }

  const credentials = {};
  for (const profile of profiles) {
    const username = String(profile.username).trim().toLowerCase();
    credentials[username] = saved?.users?.[username] || crypto.randomBytes(24).toString("base64url");
  }
  fs.mkdirSync(path.dirname(CREDENTIALS_FILE), { recursive: true });
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify({ projectUrl, users: credentials }, null, 2), { mode: 0o600 });
  return credentials;
}

async function targetTableIds(client, table) {
  const ids = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from(table).select("id").range(offset, offset + 999);
    if (error) throw new Error(`Gagal memeriksa tabel Supabase ${table}: ${error.message}`);
    ids.push(...(data || []).map((row) => row.id));
    if (!data || data.length < 1000) break;
  }
  return ids;
}

async function checkTarget(client, rowsByTable, resume) {
  for (const table of TABLES) {
    const existingIds = await targetTableIds(client, table);
    if (!existingIds.length) continue;
    if (!resume) {
      throw new Error(`Tabel Supabase ${table} tidak kosong. Gunakan project baru atau evaluasi --resume; tidak ada data yang dihapus.`);
    }
    const sourceIds = new Set(rowsByTable[table].map((row) => row.id));
    if (existingIds.some((id) => !sourceIds.has(id))) {
      throw new Error(`Tabel Supabase ${table} berisi ID yang tidak ada di database lokal; --resume dibatalkan.`);
    }
  }
}

async function ensureAuthUser(client, profile, password) {
  const userOptions = {
    email: profile.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: profile.full_name, role: profile.role },
  };
  const existing = await client.auth.admin.getUserById(profile.id);
  if (existing.data.user) {
    const { error } = await client.auth.admin.updateUserById(profile.id, userOptions);
    if (error) throw new Error(`Gagal memperbarui akun ${profile.username}: ${error.message}`);
    return;
  }
  const { error } = await client.auth.admin.createUser({ id: profile.id, ...userOptions });
  if (error) throw new Error(`Gagal membuat akun ${profile.username}: ${error.message}`);
}

async function writeRows(client, table, rows) {
  const onConflict = table === "settings" ? "key" : "id";
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    const { error } = await client.from(table).upsert(batch, { onConflict, defaultToNull: false });
    if (error) throw new Error(`Gagal memigrasikan ${table} (${offset + 1}-${offset + batch.length}): ${error.message}`);
  }
}

async function verifyCounts(client, rowsByTable) {
  for (const table of TABLES) {
    const { count, error } = await client.from(table).select("id", { count: "exact", head: true });
    if (error) throw new Error(`Gagal memverifikasi tabel ${table}: ${error.message}`);
    if (count !== rowsByTable[table].length) {
      throw new Error(`Jumlah ${table} tidak cocok: lokal ${rowsByTable[table].length}, Supabase ${count}.`);
    }
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  for (const arg of args) {
    if (!["--apply", "--resume"].includes(arg)) throw new Error(`Argumen tidak dikenal: ${arg}`);
  }
  if (args.has("--resume") && !args.has("--apply")) throw new Error("--resume hanya dapat digunakan bersama --apply.");

  const localDatabase = loadLocalDatabase();
  const rowsByTable = Object.fromEntries(TABLES.map((table) => [table, mapTable(table, localDatabase[table])]));
  validateDatabase(localDatabase, rowsByTable);
  const counts = countReport(rowsByTable);

  if (!args.has("--apply")) {
    console.log(JSON.stringify({ mode: "dry-run", source: ".data/db.json", counts }, null, 2));
    console.log("Belum ada data yang dikirim. Jalankan dengan --apply hanya setelah meninjau backup dan konfigurasi Supabase.");
    return;
  }

  const env = { ...readEnv(".env"), ...readEnv(".env.local"), ...process.env };
  const projectUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!projectUrl || !serviceKey) {
    throw new Error("Isi NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY pada .env.local sebelum migrasi.");
  }

  const client = createClient(projectUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await checkTarget(client, rowsByTable, args.has("--resume"));

  const credentials = loadOrCreateCredentials(projectUrl, rowsByTable.profiles);
  for (const profile of rowsByTable.profiles) {
    await ensureAuthUser(client, profile, credentials[String(profile.username).trim().toLowerCase()]);
  }
  for (const table of TABLES) await writeRows(client, table, rowsByTable[table]);
  await verifyCounts(client, rowsByTable);

  console.log(JSON.stringify({ mode: "complete", counts }, null, 2));
  console.log("Kredensial sementara disimpan secara lokal di .data/supabase-migration-credentials.json; bagikan secara aman dan ubah setelah login.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
