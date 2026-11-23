import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import XLSX from "xlsx";

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "data", "KHIDMAH MILAD 2024.xlsx");
const OUT = path.join(ROOT, "data", "seed.json");

const uid = (label) => {
  const h = crypto.createHash("sha256").update(String(label)).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};
const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
const clean = (v) => str(v).replace(/\s+/g, " ").replace(/^:+/, "").trim();
const upper = (v) => clean(v).toUpperCase();
const isNumericOnly = (v) => /^[\d.,\s]+$/.test(str(v)) && str(v) !== "";
const normPhone = (v) => {
  const raw = str(v);
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 9 && digits.length <= 13 && digits.startsWith("8")) return "0" + digits;
  return digits;
};
const looksPhone = (v) => {
  const d = str(v).replace(/\D/g, "");
  return d.length >= 9 && d.length <= 15 && /^[\d\s+()\.-]+$/.test(str(v));
};
const normKey = (v) =>
  str(v)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const book = XLSX.read(fs.readFileSync(SOURCE), { type: "buffer", cellDates: false });
const sheetNames = book.SheetNames;
const rowsOf = (name) =>
  XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, defval: "", raw: false, blankrows: true })
    .map((r) => Array.from(r, str))
    .map((r) => {
      while (r.length && !r[r.length - 1]) r.pop();
      return r;
    });

const periodId = uid("period:khidmah-milad-2024");
const periods = [
  {
    id: periodId,
    name: "Khidmah Milad 2024",
    year: 2024,
    start_date: "",
    end_date: "",
    status: "aktif",
    description: "Data awal hasil import dari KHIDMAH MILAD 2024.xlsx",
    source_file: "KHIDMAH MILAD 2024.xlsx",
  },
];

const masterMap = new Map();
const addMaster = (type, value) => {
  const v = clean(value);
  if (!v) return;
  const key = type + "|" + normKey(v);
  if (!masterMap.has(key)) masterMap.set(key, { id: uid("master:" + key), type, value: v, is_active: true });
};
addMaster("jenis_acara", "Khidmah");
addMaster("status_personil", "Aktif");
addMaster("status_personil", "Nonaktif");
addMaster("status_penugasan", "Aktif");
addMaster("status_penugasan", "Selesai");
addMaster("status_penugasan", "Dihentikan");
addMaster("kategori_divisi", "Dapur");
addMaster("kategori_divisi", "Prasmanan");
addMaster("kategori_divisi", "Kebersihan");
addMaster("kategori_divisi", "Logistik");
addMaster("kategori_divisi", "Keamanan");
addMaster("kategori_divisi", "Pengawasan");
addMaster("kategori_divisi", "Lainnya");
addMaster("kategori_pekerjaan", "Pengawasan Panitia");
addMaster("kategori_pekerjaan", "Keamanan Dalam");

const rekapRows = rowsOf("REKAP");
const rekap = [];
for (let i = 6; i < rekapRows.length; i++) {
  const r = rekapRows[i];
  if (upper(r[0]) === "JUMLAH") break;
  const no = Number(String(r[0] || "").replace(/[^\d]/g, ""));
  if (!no || !clean(r[1])) continue;
  rekap.push({
    no,
    name: clean(r[1]),
    leader: clean(r[2]),
    phone: normPhone(r[3]),
    leaderCount: Number(r[4]) || 0,
    required: Number(r[5]) || 0,
    available: Number(r[6]) || 0,
    lacking: Number(r[8]) || 0,
    row: i + 1,
  });
}

const metaOf = (rows) => {
  const out = { division: "", leader: "", coordinator: "", required: 0, reported: 0, headerRow: -1 };
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const r = rows[i];
    const first = upper(r[0]);
    const rest = r.slice(1).filter((v) => v && upper(v) !== ":");
    const value = clean(rest[0] || "");
    if (/^(BAGIAN|DIVISI|KOORDINASI)$/.test(first) && value) out.division = value;
    if (first === "PENANGGUNG JAWAB" && value) out.leader = value;
    if (first === "KETUA" && value && !upper(value).includes("NAMA")) out.coordinator = value;
    if (/^(KEBUTUHAN|KEBUTUHAN PERSONIL)$/.test(first)) {
      const n = Number(String(value).replace(/[^\d]/g, ""));
      if (n > 0) out.required = n;
    }
    if (/^(JUMLAH PERSONIL|TERSEDIA \(Orang\))$/.test(first)) {
      const n = Number(String(value || r[r.length - 1] || "").replace(/[^\d]/g, ""));
      if (n > 0) out.reported = n;
    }
    const cells = r.map(upper);
    if (cells.includes("NAMA") || cells.includes("NAMA PEKERJAAN") || (cells.includes("NO") && cells.includes("NAMA"))) {
      if (out.headerRow < 0) out.headerRow = i;
    }
  }
  return out;
};

const divisions = rekap.map((r, i) => ({
  id: uid("division:" + r.name),
  period_id: periodId,
  code: "DIV-" + String(i + 1).padStart(3, "0"),
  name: r.name,
  alias: r.name,
  category: "",
  leader_name: r.leader || "",
  coordinator_name: "",
  required_count: r.required || 0,
  notes: "Data master dari sheet REKAP",
  sort_order: i + 1,
  source_file: "KHIDMAH MILAD 2024.xlsx",
  source_sheet: "REKAP",
  is_active: true,
}));
const divisionById = new Map(divisions.map((d) => [d.id, d]));
const personnel = [];
const assignments = [];
const fingerprints = new Map();
const positionsSet = new Set();
const notes = [];

const personByRow = (name, korwil, phone, note, sheet, row, divisionId, positionName) => {
  const phoneNorm = normPhone(phone);
  const keyName = normKey(name);
  const keyKorwil = normKey(korwil);
  let existing = null;
  if (phoneNorm) {
    for (const p of personnel) {
      if (normKey(p.full_name) === keyName && p.phone === phoneNorm && (!keyKorwil || !normKey(p.korwil) || normKey(p.korwil) === keyKorwil)) {
        existing = p;
        break;
      }
    }
  }
  let person = existing;
  if (!person) {
    const rawKey = [keyName, phoneNorm, keyKorwil].filter(Boolean).join("|");
    if (phoneNorm && fingerprints.has(rawKey)) person = fingerprints.get(rawKey);
  }
  if (!person) {
    const code = "P-" + String(personnel.length + 1).padStart(4, "0");
    person = {
      id: uid("personnel:" + code + ":" + normKey(name) + ":" + phoneNorm + ":" + keyKorwil + ":" + row + ":" + sheet),
      code,
      full_name: name,
      gender: "",
      birth_place: "",
      birth_date: "",
      origin: korwil,
      korwil,
      phone: phoneNorm,
      phone_raw: str(phone),
      address: "",
      status: "aktif",
      notes: note,
      source_file: "KHIDMAH MILAD 2024.xlsx",
      source_sheet: sheet,
      source_row: row,
      fingerprint: [keyName, phoneNorm, keyKorwil].filter(Boolean).join("|"),
    };
    personnel.push(person);
    if (phoneNorm) fingerprints.set([keyName, phoneNorm, keyKorwil].filter(Boolean).join("|"), person);
    addMaster("asal_daerah", korwil);
    addMaster("korwil", korwil);
    if (note && note.length <= 40) positionsSet.add(note);
  }
  const exists = assignments.some((a) => a.personnel_id === person.id && a.division_id === divisionId && a.period_id === periodId);
  if (!exists) {
    assignments.push({
      id: uid("assignment:" + person.id + ":" + divisionId),
      personnel_id: person.id,
      period_id: periodId,
      division_id: divisionId,
      position_id: "",
      position_name: positionName || "Anggota",
      start_date: "",
      end_date: "",
      status: "aktif",
      notes: note,
      source_file: "KHIDMAH MILAD 2024.xlsx",
      source_sheet: sheet,
      source_row: row,
    });
  }
  return person;
};

const personSheets = sheetNames.slice(1, 43);
personSheets.forEach((sheet, idx) => {
  const rows = rowsOf(sheet);
  const meta = metaOf(rows);
  const rec = rekap[idx];
  const name = rec?.name || meta.division || sheet.replace(/^\d+\.\s*/, "");
  const id = uid("division:" + name);
  let division = divisionById.get(id);
  if (!division) {
    division = {
      id,
      period_id: periodId,
      code: "DIV-" + String(divisions.length + 1).padStart(3, "0"),
      name,
      alias: meta.division,
      category: "",
      leader_name: rec?.leader || meta.leader || "",
      coordinator_name: meta.coordinator || "",
      required_count: meta.required || rec?.required || 0,
      notes: "Bagian tanpa baris REKAP",
      sort_order: divisions.length + 1,
      source_file: "KHIDMAH MILAD 2024.xlsx",
      source_sheet: sheet,
      is_active: true,
    };
    divisions.push(division);
    divisionById.set(id, division);
  }
  division.alias = meta.division || division.alias;
  division.leader_name = division.leader_name || meta.leader || "";
  division.coordinator_name = meta.coordinator || "";
  division.required_count = meta.required || division.required_count;
  division.notes = `Sheet: ${sheet}${meta.reported ? ` | Jumlah personil dilaporkan: ${meta.reported}` : ""}`;
  division.source_sheet = sheet;
  if (meta.leader) addMaster("penanggung_jawab", meta.leader);
  if (meta.coordinator) addMaster("koordinator", meta.coordinator);
  if (meta.headerRow < 0) {
    notes.push({ sheet, reason: "Header tabel personil tidak ditemukan" });
    return;
  }
  const header = rows[meta.headerRow].map(upper);
  const idxOf = (...names) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const nameIdx = idxOf("NAMA") >= 0 ? idxOf("NAMA") : 1;
  const korwilIdx = idxOf("KORWIL", "KOORDINASI", "KOORDINATOR");
  const phoneIdx = idxOf("NO HP", "NO TLPN", "NO TELEPON", "NO WA", "NO. WA", "NO TLP");
  const ketIdx = idxOf("KET", "KETERANGAN");
  for (let r = meta.headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    const rawName = clean(row[nameIdx] || "");
    if (!rawName || isNumericOnly(rawName)) continue;
    if (/^(JUMLAH|NO|NAMA|KET|KETERANGAN|TERSEDIA)/.test(upper(rawName))) continue;
    if (rawName.length < 2 || rawName.length > 120) continue;
    const korwil = korwilIdx >= 0 ? clean(row[korwilIdx] || "") : "";
    let phone = phoneIdx >= 0 ? clean(row[phoneIdx] || "") : "";
    let note = ketIdx >= 0 ? clean(row[ketIdx] || "") : "";
    if (!phone && note && looksPhone(note)) {
      phone = note;
      note = "";
    }
    if (!phone && ketIdx >= 0 && korwilIdx === ketIdx && looksPhone(clean(row[ketIdx]))) phone = clean(row[ketIdx]);
    const position = note && !looksPhone(note) ? note : "Anggota";
    personByRow(rawName, korwil, phone, note, sheet, r + 1, id, position);
  }
});

const supervisors = [];
const workAssignments = [];
const supervisorSheets = sheetNames.filter((s) => /PENGAWAS/i.test(s));
supervisorSheets.forEach((sheet) => {
  const rows = rowsOf(sheet);
  const meta = metaOf(rows);
  const group = upper(sheet).includes("PANITIA I") && !upper(sheet).includes("II") ? "Pengawas Panitia I" : upper(sheet).includes("II") ? "Pengawas Panitia II" : upper(sheet).includes("III") ? "Pengawas Panitia III" : "Pengawas Panitia IV";
  const leader = clean(meta.leader || "");
  const supId = uid("supervisor:" + group + ":" + leader);
  if (!supervisors.some((s) => s.id === supId)) {
    supervisors.push({
      id: supId,
      period_id: periodId,
      name: leader || group,
      group_name: group,
      phone: "",
      notes: leader ? "" : "Penanggung jawab belum diisi pada spreadsheet",
      status: "aktif",
      source_file: "KHIDMAH MILAD 2024.xlsx",
      source_sheet: sheet,
    });
  }
  addMaster("kategori_pekerjaan", group);
  if (meta.headerRow < 0) return;
  const header = rows[meta.headerRow].map(upper);
  const nameIdx = header.findIndex((h) => h.includes("NAMA"));
  const ketIdx = header.findIndex((h) => h.includes("KET"));
  for (let r = meta.headerRow + 1; r < rows.length; r++) {
    const raw = clean(rows[r][nameIdx >= 0 ? nameIdx : 1] || "");
    if (!raw || isNumericOnly(raw) || /^NAMA/.test(upper(raw))) continue;
    workAssignments.push({
      id: uid("work:" + sheet + ":" + raw + ":" + r),
      supervisor_id: supId,
      period_id: periodId,
      name: raw,
      notes: ketIdx >= 0 ? clean(rows[r][ketIdx] || "") : "",
      status: "aktif",
      source_file: "KHIDMAH MILAD 2024.xlsx",
      source_sheet: sheet,
      source_row: r + 1,
    });
  }
});

const securitySheet = "Tim Keamanan Dalam";
if (sheetNames.includes(securitySheet)) {
  const rows = rowsOf(securitySheet);
  const divId = uid("division:Tim Keamanan Dalam");
  divisions.push({
    id: divId,
    period_id: periodId,
    code: "DIV-" + String(divisions.length + 1).padStart(3, "0"),
    name: "Tim Keamanan Dalam",
    alias: "Tim Keamanan Dalam",
    category: "Keamanan",
    leader_name: clean((rows[0][0] || "").replace(/Koordinator\s*:/i, "")),
    coordinator_name: clean((rows[0][0] || "").replace(/Koordinator\s*:/i, "")),
    required_count: 0,
    notes: "Data penugasan keamanan dari sheet Tim Keamanan Dalam",
    sort_order: divisions.length + 1,
    source_file: "KHIDMAH MILAD 2024.xlsx",
    source_sheet: securitySheet,
    is_active: true,
  });
  let group = "Tim Keamanan";
  for (let r = 0; r < rows.length; r++) {
    const line = clean(rows[r][0] || "");
    const nm = clean(rows[r][1] || "");
    if (/^[A-Z]\.\s/.test(line)) group = line;
    if (!nm || isNumericOnly(nm) || upper(nm) === "NAMA") continue;
    personByRow(nm, "", "", group, securitySheet, r + 1, divId, group);
  }
}

addMaster("jabatan", "Anggota");
[...positionsSet].forEach((p) => addMaster("jabatan", p));
[...rekap].forEach((d) => addMaster("nama_bagian", d.name));
const master_data = [...masterMap.values()].map((m, i) => ({ ...m, sort_order: i + 1 }));

const seed = {
  meta: {
    source_file: "KHIDMAH MILAD 2024.xlsx",
    generated_at: new Date().toISOString(),
    sheets_total: sheetNames.length,
    sheets_personnel: personSheets.length,
    sheets_supervision: supervisorSheets.length,
    notes,
  },
  periods,
  master_data,
  divisions,
  personnel,
  assignments,
  supervisors,
  work_assignments: workAssignments,
  operator_permissions: [],
  activity_logs: [],
  import_batches: [],
  import_rows: [],
  backups: [],
  settings: [
    { key: "app_name", value: "SISTEM PENDATAAN PERSONIL" },
    { key: "organization", value: "Khidmah Milad" },
    { key: "active_period_id", value: periodId },
  ],
};

fs.writeFileSync(OUT, JSON.stringify(seed, null, 2), "utf8");
console.log(JSON.stringify({
  periods: seed.periods.length,
  master: master_data.length,
  divisions: divisions.length,
  personnel: personnel.length,
  assignments: assignments.length,
  supervisors: supervisors.length,
  work: workAssignments.length,
  warnings: notes,
}, null, 2));
