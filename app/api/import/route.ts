import { NextRequest } from "next/server";
import XLSX from "xlsx";
import { all, bulkInsert, insert, nextCode, patch, snapshot, uid } from "@/lib/server/db";
import { getSession, logActivity } from "@/lib/server/auth";
import { can } from "@/lib/server/auth";
import { apiError, fail, ok } from "@/lib/server/http";
import type { Assignment, ImportBatch, ImportRow, Personnel } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const upper = (v: unknown) => str(v).toUpperCase();
const clean = (v: unknown) => str(v).replace(/\s+/g, " ");

function normalizePhone(v: unknown) {
  const raw = str(v);
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 9 && digits.length <= 13 && digits.startsWith("8")) return "0" + digits;
  return digits;
}
const keyOf = (name: string, phone: string, korwil: string) =>
  [name.toLowerCase().replace(/\s+/g, " "), phone, korwil.toLowerCase().replace(/\s+/g, " ")].filter(Boolean).join("|");

const ALIASES: Record<string, string[]> = {
  name: ["NAMA", "NAMA PERSONIL", "NAMA LENGKAP", "NAMA PEKERJAAN"],
  korwil: ["KORWIL", "KOORDINASI", "KOORDINATOR", "ASAL", "ASAL DAERAH", "DAERAH"],
  phone: ["NO HP", "NO. HP", "NO TLPN", "NO TELEPON", "NO. TELEPON", "NO TLP", "NO WA", "NO. WA", "WHATSAPP", "KONTAK"],
  notes: ["KET", "KETERANGAN", "CATATAN"],
};

function findHeader(rows: string[][], explicit?: string) {
  if (explicit && /^\d+$/.test(explicit)) return Math.max(0, Number(explicit) - 1);
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = rows[i].map(upper);
    if (cells.some((c) => ALIASES.name.some((a) => c === a || c.includes(a))) && cells.some((c) => /^(NO|NO\.)|NAMA/.test(c))) return i;
  }
  return -1;
}

function columnIndex(header: string[], mappingValue: string | undefined, field: string) {
  if (mappingValue !== undefined && mappingValue !== "") {
    if (/^\d+$/.test(mappingValue)) return Number(mappingValue) - 1;
    const exact = header.findIndex((h) => upper(h) === upper(mappingValue));
    if (exact >= 0) return exact;
  }
  const alias = ALIASES[field] || [];
  for (const a of alias) {
    const idx = header.findIndex((h) => upper(h) === a || upper(h).includes(a));
    if (idx >= 0) return idx;
  }
  if (field === "notes") {
    const idx = header.findIndex((h) => upper(h).includes("KET"));
    return idx;
  }
  return -1;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) throw new Error("UNAUTHORIZED");
    if (!(await can(session, "import"))) throw new Error("FORBIDDEN");
    const form = await req.formData();
    const mode = str(form.get("mode") || "preview");
    const file = form.get("file");
    if (!(file instanceof File)) return fail("File Excel belum diunggah");
    const periodId = str(form.get("period_id"));
    const defaultDivisionId = str(form.get("division_id"));
    const sheets: string[] = JSON.parse(str(form.get("sheets") || "[]"));
    const mapping: Record<string, string> = JSON.parse(str(form.get("mapping") || "{}"));
    const selected: string[] = JSON.parse(str(form.get("selected") || "[]"));
    const batchId = str(form.get("batch_id"));

    const book = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer", cellDates: false });
    const sheetNames = sheets.length ? sheets.filter((s) => book.SheetNames.includes(s)) : book.SheetNames;
    const existing = await all<Personnel>("personnel");
    const divisions = await all<{ id: string; name: string; period_id: string }>("divisions");
    const existingKeys = new Set(existing.map((p) => keyOf(p.full_name, p.phone || "", p.korwil || p.origin || "")));
    const seen = new Set<string>();
    const candidates: (ImportRow & { token: string; display: Record<string, string> })[] = [];
    const sheetSummaries: { sheet: string; header_row: number; columns: Record<string, number>; rows: number }[] = [];

    for (const sheet of sheetNames) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheet], { header: 1, defval: "", raw: false, blankrows: true })
        .map((r) => Array.from(r, str));
      const headerRow = findHeader(rows, mapping.header_row);
      if (headerRow < 0) {
        candidates.push({
          id: uid(), batch_id: batchId || "", status: "dilewati",
          raw_data: {}, mapped_data: {}, message: "Sheet tidak memiliki tabel personil yang dikenali",
          source_sheet: sheet, source_row: 0, token: `${sheet}|0`, display: {},
        });
        sheetSummaries.push({ sheet, header_row: -1, columns: {}, rows: 0 });
        continue;
      }
      const header = rows[headerRow].map(upper);
      const cols = {
        name: columnIndex(header, mapping.name, "name"),
        korwil: columnIndex(header, mapping.korwil, "korwil"),
        phone: columnIndex(header, mapping.phone, "phone"),
        notes: columnIndex(header, mapping.notes, "notes"),
      };
      let count = 0;
      for (let i = headerRow + 1; i < rows.length; i++) {
        const row = rows[i];
        const name = clean(row[cols.name] || "");
        if (!name) continue;
        if (/^[\d.,\s]+$/.test(name)) continue;
        if (/^(JUMLAH|NO|NAMA|KET|KETERANGAN|TERSEDIA)/.test(upper(name))) continue;
        count++;
        let phoneRaw = cols.phone >= 0 ? str(row[cols.phone]) : "";
        let notes = cols.notes >= 0 ? clean(row[cols.notes]) : "";
        if (!phoneRaw && notes && /^[\d\s+()\.-]{9,}$/.test(notes)) {
          phoneRaw = notes;
          notes = "";
        }
        const phone = normalizePhone(phoneRaw);
        const korwil = cols.korwil >= 0 ? clean(row[cols.korwil]) : "";
        const key = keyOf(name, phone, korwil);
        let status: ImportRow["status"] = "berhasil";
        let message = "Siap diimport";
        if (name.length < 3) {
          status = "perlu_diperiksa";
          message = "Nama terlalu singkat";
        } else if (!phone && !korwil) {
          status = "perlu_diperiksa";
          message = "Tidak ada nomor telepon maupun korwil";
        }
        if (existingKeys.has(key) || seen.has(key)) {
          status = "duplikat";
          message = existingKeys.has(key) ? "Sudah terdaftar dalam database" : "Duplikat dalam file";
        }
        seen.add(key);
        candidates.push({
          id: uid(), batch_id: batchId || "", status,
          raw_data: Object.fromEntries(header.map((h, idx) => [h || `kolom_${idx + 1}`, str(row[idx])])),
          mapped_data: { full_name: name, korwil, phone, phone_raw: phoneRaw, notes, division_id: defaultDivisionId },
          message, source_sheet: sheet, source_row: i + 1,
          token: `${sheet}|${i + 1}`, display: { name, korwil, phone, notes },
        });
      }
      sheetSummaries.push({ sheet, header_row: headerRow + 1, columns: cols, rows: count });
    }

    if (mode === "preview") {
      return ok({
        file_name: file.name,
        sheets: sheetSummaries,
        rows: candidates,
        counts: {
          total: candidates.length,
          berhasil: candidates.filter((r) => r.status === "berhasil").length,
          duplikat: candidates.filter((r) => r.status === "duplikat").length,
          perlu_diperiksa: candidates.filter((r) => r.status === "perlu_diperiksa").length,
          dilewati: candidates.filter((r) => r.status === "dilewati").length,
        },
      });
    }

    const usable = candidates.filter((r) => selected.includes(r.token));
    if (!usable.length) return fail("Tidak ada baris yang dipilih untuk diimport");
    const snap = await snapshot();
    const backup = await insert("backups", {
      id: uid(), file_name: `auto-import-${file.name}`, created_by: session.fullName,
      size: JSON.stringify(snap).length, summary: { auto: 1 }, created_at: new Date().toISOString(), snapshot: snap,
    });
    const batch = await insert("import_batches", {
      id: batchId || uid(), file_name: file.name, period_id: periodId, created_by: session.fullName,
      status: "selesai", backup_id: String(backup.id), created_at: new Date().toISOString(),
    });
    const lastCode = await nextCode("personnel", "P", 4);
    let counter = Number(lastCode.split("-")[1]) - 1;
    const newPersonnel: Personnel[] = [];
    const newAssignments: Assignment[] = [];
    const batchIdValue = String(batch.id);
    for (const row of usable) {
      const m = row.mapped_data as Record<string, string>;
      const division = divisions.find((d) => d.id === (m.division_id || defaultDivisionId));
      counter++;
      const person: Personnel = {
        id: uid(), code: `P-${String(++counter).padStart(4, "0")}`,
        full_name: m.full_name, korwil: m.korwil, origin: m.korwil, phone: m.phone, phone_raw: m.phone_raw,
        notes: m.notes, status: "aktif", source_file: file.name, source_sheet: row.source_sheet,
        source_row: row.source_row, fingerprint: keyOf(m.full_name, m.phone, m.korwil),
        created_at: new Date().toISOString(),
      };
      newPersonnel.push(person);
      if (division) {
        newAssignments.push({
          id: uid(), personnel_id: person.id, period_id: division.period_id || periodId,
          division_id: division.id, position_name: "Anggota", status: "aktif",
          notes: m.notes, source_file: file.name, source_sheet: row.source_sheet, source_row: row.source_row,
          created_at: new Date().toISOString(),
        });
      }
    }
    await bulkInsert("personnel", newPersonnel as unknown as Record<string, unknown>[]);
    await bulkInsert("assignments", newAssignments as unknown as Record<string, unknown>[]);
    await bulkInsert("import_rows", usable.map((r) => ({ ...r, batch_id: batchIdValue, token: undefined, display: undefined })) as unknown as Record<string, unknown>[]);
    const summary = {
      berhasil: usable.filter((r) => r.status === "berhasil").length,
      duplikat: usable.filter((r) => r.status === "duplikat").length,
      perlu_diperiksa: usable.filter((r) => r.status === "perlu_diperiksa").length,
      dilewati: usable.filter((r) => r.status === "dilewati").length,
    };
    await patch("import_batches", batchIdValue, { summary });
    await logActivity({ actor: session, action: "import", entity_type: "import_batches", entity_id: batchIdValue, period_id: periodId, description: `Import ${file.name}: ${usable.length} baris`, after_data: summary });
    return ok({ data: { batch, summary } });
  } catch (error) {
    return apiError(error);
  }
}
