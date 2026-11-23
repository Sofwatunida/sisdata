"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, History, RotateCcw, Save, Upload, XCircle } from "lucide-react";
import { useApp } from "@/components/AppContext";
import { api, post } from "@/lib/client/api";
import { Badge, EmptyState, Field, Loading, PageHeader, Pagination, confirmDialog, toast } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import type { Backup, ImportBatch } from "@/lib/types";

type PreviewRow = {
  token: string; status: string; message: string; source_sheet: string; source_row: number;
  display: { name: string; korwil: string; phone: string; notes: string };
};

export default function ImportExportPage() {
  const { activePeriodId, periods, divisions } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({ name: "", korwil: "", phone: "", notes: "", header_row: "" });
  const [preview, setPreview] = useState<{ rows: PreviewRow[]; counts: Record<string, number>; sheets: { sheet: string; header_row: number; columns: Record<string, number>; rows: number }[] } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [batchId, setBatchId] = useState("");
  const [page, setPage] = useState(1);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [exportForm, setExportForm] = useState({ type: "personnel", format: "xlsx", period_id: activePeriodId, division_id: "", korwil: "", position: "" });
  const PER = 12;

  const loadMeta = async () => {
    try {
      const [b, k] = await Promise.all([
        api<{ data: Backup[] }>("/api/data/backups"),
        api<{ data: ImportBatch[] }>("/api/data/import_batches"),
      ]);
      setBackups(b.data || []); setBatches(k.data || []);
    } catch { /* diabaikan */ }
  };
  useEffect(() => { void loadMeta(); }, []);
  useEffect(() => setExportForm((f) => ({ ...f, period_id: activePeriodId })), [activePeriodId]);

  async function onFile(f: File | null) {
    setFile(f); setPreview(null); setSelected(new Set()); setBatchId("");
    if (!f) { setSheets([]); setSelectedSheets([]); return; }
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(await f.arrayBuffer(), { type: "array" });
      setSheets(book.SheetNames);
      setSelectedSheets(book.SheetNames.slice(0, 1));
    } catch (e) { toast(`Gagal membaca file: ${(e as Error).message}`, "error"); }
  }

  function form(mode: "preview" | "commit") {
    const fd = new FormData();
    if (file) fd.append("file", file);
    fd.append("mode", mode);
    fd.append("period_id", exportForm.period_id || activePeriodId);
    fd.append("division_id", exportForm.division_id);
    fd.append("sheets", JSON.stringify(selectedSheets));
    fd.append("mapping", JSON.stringify(mapping));
    if (mode === "commit") fd.append("selected", JSON.stringify([...selected]));
    if (batchId) fd.append("batch_id", batchId);
    return fd;
  }

  async function doPreview() {
    if (!file) { toast("Pilih file XLSX terlebih dahulu", "error"); return; }
    setLoading(true);
    try {
      const r = await api<{ rows: PreviewRow[]; counts: Record<string, number>; sheets: { sheet: string; header_row: number; columns: Record<string, number>; rows: number }[] }>("/api/import", { method: "POST", body: form("preview") });
      setPreview(r);
      setSelected(new Set(r.rows.filter((x) => x.status === "berhasil").map((x) => x.token)));
      setBatchId(crypto.randomUUID());
      toast(`Preview siap: ${r.counts.total} baris terdeteksi`);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  }

  async function doCommit() {
    if (!selected.size) { toast("Pilih minimal satu baris", "error"); return; }
    if (!(await confirmDialog(`Import ${selected.size} baris data?`, "Sebuah backup otomatis dibuat agar batch import dapat dibatalkan.", "Lanjutkan import"))) return;
    setLoading(true);
    try {
      const r = await api<{ data: { summary: Record<string, number> } }>("/api/import", { method: "POST", body: form("commit") });
      toast(`Import selesai: ${r.data.summary.berhasil} berhasil, ${r.data.summary.duplikat} duplikat`);
      setPreview(null); setFile(null); setSelected(new Set()); await loadMeta();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  }

  async function rollback(batch: ImportBatch) {
    if (!(await confirmDialog(`Batalkan import ${batch.file_name}?`, "Data yang sudah diubah terpisah setelah import tidak akan dihapus.", "Pulihkan"))) return;
    try { await post("/api/action", { action: "rollback_import", payload: { batch_id: batch.id } }); toast("Batch import dibatalkan"); await loadMeta(); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  async function createBackup() {
    try { await post("/api/action", { action: "create_backup", payload: {} }); toast("Backup database dibuat"); await loadMeta(); }
    catch (e) { toast((e as Error).message, "error"); }
  }
  async function restore(b: Backup) {
    if (!(await confirmDialog(`Pulihkan dari ${b.file_name}?`, "Seluruh data saat ini akan diganti dengan isi backup setelah validasi.", "Pulihkan"))) return;
    try { await post("/api/action", { action: "restore_backup", payload: { backup_id: b.id, confirm: true } }); toast("Data berhasil dipulihkan"); await loadMeta(); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  const exportUrl = `/api/export?type=${exportForm.type}&format=${exportForm.format}&period_id=${exportForm.period_id}&division_id=${exportForm.division_id}&korwil=${encodeURIComponent(exportForm.korwil)}&position=${encodeURIComponent(exportForm.position)}`;
  const rows = preview?.rows || [];
  const pageRows = rows.slice((page - 1) * PER, page * PER);

  return (
    <div>
      <PageHeader title="Import & Export" description="Impor data dari Excel dengan preview dan pemetaan kolom, ekspor laporan, serta cadangan data" />

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2"><Upload className="h-5 w-5 text-navy-700" /><h2 className="font-bold text-navy-900">Import Excel</h2></div>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-navy-400">
            <FileSpreadsheet className="mb-2 h-7 w-7 text-navy-600" />
            <span className="text-sm font-semibold text-slate-700">{file ? file.name : "Pilih file .xlsx"}</span>
            <span className="mt-1 text-xs text-slate-500">Seluruh sheet akan dikenali sebagai kandidat data</span>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => void onFile(e.target.files?.[0] || null)} />
          </label>

          {file && (
            <div className="mt-4 space-y-4">
              <Field label="Sheet yang akan diproses">
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {sheets.map((s) => (
                    <label key={s} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50">
                      <input type="checkbox" className="h-4 w-4" checked={selectedSheets.includes(s)} onChange={() => setSelectedSheets((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])} /> {s}
                    </label>
                  ))}
                </div>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                {([["name", "Kolom Nama"], ["korwil", "Kolom Korwil/Asal"], ["phone", "Kolom No. HP/Telepon"], ["notes", "Kolom Keterangan"]] as const).map(([key, label]) => (
                  <Field key={key} label={label}><input className="input" placeholder="Otomatis" value={mapping[key]} onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })} /></Field>
                ))}
                <Field label="Baris header (opsional)"><input className="input" placeholder="Mis. 6" value={mapping.header_row} onChange={(e) => setMapping({ ...mapping, header_row: e.target.value })} /></Field>
                <Field label="Bagian tujuan"><select className="input" value={exportForm.division_id} onChange={(e) => setExportForm({ ...exportForm, division_id: e.target.value })}><option value="">Otomatis per sheet</option>{divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary" onClick={() => void doPreview()} disabled={loading || !selectedSheets.length}>{loading ? "Memproses..." : "Preview Data"}</button>
                <button className="btn-secondary" onClick={() => { setFile(null); setPreview(null); setSelected(new Set()); }}>Bersihkan</button>
              </div>
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2"><Download className="h-5 w-5 text-navy-700" /><h2 className="font-bold text-navy-900">Export Data</h2></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Jenis laporan">
              <select className="input" value={exportForm.type} onChange={(e) => setExportForm({ ...exportForm, type: e.target.value })}>
                <option value="personnel">Data personil</option><option value="divisions">Data bagian</option>
                <option value="rekap">Rekapitulasi</option><option value="needs">Kebutuhan & kekurangan</option>
                <option value="supervision">Data pengawasan</option>
              </select>
            </Field>
            <Field label="Format"><select className="input" value={exportForm.format} onChange={(e) => setExportForm({ ...exportForm, format: e.target.value })}><option value="xlsx">Excel (.xlsx)</option><option value="pdf">PDF</option><option value="json">JSON (backup penuh)</option></select></Field>
            <Field label="Periode"><select className="input" value={exportForm.period_id} onChange={(e) => setExportForm({ ...exportForm, period_id: e.target.value })}>{periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Bagian"><select className="input" value={exportForm.division_id} onChange={(e) => setExportForm({ ...exportForm, division_id: e.target.value })}><option value="">Semua bagian</option>{divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field label="Korwil"><input className="input" value={exportForm.korwil} onChange={(e) => setExportForm({ ...exportForm, korwil: e.target.value })} placeholder="Semua korwil" /></Field>
            <Field label="Jabatan"><input className="input" value={exportForm.position} onChange={(e) => setExportForm({ ...exportForm, position: e.target.value })} placeholder="Semua jabatan" /></Field>
          </div>
          <a className="btn-primary mt-4 w-full" href={exportUrl}><Download className="h-4 w-4" /> Unduh laporan</a>
          <p className="mt-3 text-xs text-slate-500">Laporan memiliki judul, tanggal pembuatan, tabel rapi, dan nomor halaman pada PDF.</p>
        </div>
      </div>

      {preview && (
        <div className="card mt-5 overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-bold text-navy-900">Preview Import</h2>
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                {Object.entries(preview.counts).map(([k, v]) => <span key={k} className="badge bg-slate-100 text-slate-600">{k}: <strong className="ml-1">{v}</strong></span>)}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">{selected.size} baris dipilih</span>
              <button className="btn-secondary !py-1.5 !text-xs" onClick={() => setSelected(new Set(rows.map((r) => r.token)))}>Pilih semua</button>
              <button className="btn-primary !py-1.5 !text-xs" onClick={() => void doCommit()} disabled={loading || !selected.size}>Lanjutkan Import</button>
            </div>
          </div>
          {preview.sheets.some((s) => s.header_row < 0) && <div className="bg-amber-50 px-5 py-2 text-xs text-amber-800">Ada sheet tanpa tabel personil yang dikenali; baris tersebut dilewati dan tidak akan diimport.</div>}
          {rows.length === 0 ? <EmptyState title="Tidak ada baris personil terdeteksi" /> : (
            <>
              <div className="table-wrap"><table className="table">
                <thead><tr><th><input type="checkbox" checked={pageRows.length > 0 && pageRows.every((r) => selected.has(r.token))} onChange={() => setSelected((s) => { const n = new Set(s); pageRows.forEach((r) => n.has(r.token) ? n.delete(r.token) : n.add(r.token)); return n; })} /></th><th>Status</th><th>Sheet : Baris</th><th>Nama</th><th>Korwil</th><th>No. Telepon</th><th>Keterangan</th><th>Catatan</th></tr></thead>
                <tbody>
                  {pageRows.map((r) => <tr key={r.token}>
                    <td><input type="checkbox" className="h-4 w-4" checked={selected.has(r.token)} onChange={() => setSelected((s) => { const n = new Set(s); n.has(r.token) ? n.delete(r.token) : n.add(r.token); return n; })} /></td>
                    <td><Badge status={r.status} /></td><td className="text-xs text-slate-500">{r.source_sheet}:{r.source_row}</td>
                    <td className="font-semibold">{r.display.name}</td><td>{r.display.korwil || "-"}</td><td>{r.display.phone || "-"}</td><td className="max-w-[160px] truncate">{r.display.notes || "-"}</td><td className="text-xs text-slate-500">{r.message}</td>
                  </tr>)}
                </tbody>
              </table></div>
              <Pagination page={page} total={rows.length} perPage={PER} onChange={setPage} />
            </>
          )}
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><History className="h-5 w-5 text-navy-700" /><h2 className="font-bold text-navy-900">Riwayat Batch Import</h2></div><button className="btn-secondary !py-1.5 !text-xs" onClick={() => void loadMeta()}><RotateCcw className="h-3.5 w-3.5" /> Muat ulang</button></div>
          {batches.length === 0 ? <EmptyState title="Belum ada batch import" /> : (
            <ul className="divide-y divide-slate-100">
              {batches.map((b) => <li key={b.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                <span className="flex-1"><span className="font-medium text-slate-700">{b.file_name}</span><span className="block text-xs text-slate-400">{formatDateTime(b.created_at)} · {b.created_by}</span></span>
                <Badge status={b.status}>{b.status}</Badge>
                {b.status === "selesai" && <button className="btn-secondary !py-1 !text-xs" onClick={() => void rollback(b)}>Batalkan</button>}
              </li>)}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Save className="h-5 w-5 text-navy-700" /><h2 className="font-bold text-navy-900">Backup & Pemulihan</h2></div><button className="btn-primary !py-1.5 !text-xs" onClick={() => void createBackup()}>Buat Backup</button></div>
          {backups.length === 0 ? <EmptyState title="Belum ada backup" /> : (
            <ul className="divide-y divide-slate-100">
              {backups.map((b) => <li key={b.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                <span className="flex-1"><span className="font-medium text-slate-700">{b.file_name}</span><span className="block text-xs text-slate-400">{formatDateTime(b.created_at)} · {(b.size / 1024).toFixed(1)} KB</span></span>
                <button className="btn-secondary !py-1 !text-xs" onClick={() => void restore(b)}>Pulihkan</button>
              </li>)}
            </ul>
          )}
          <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
            <a className="btn-secondary !py-1.5 !text-xs" href="/api/export?type=full&format=json">Unduh backup JSON</a>
            <button className="btn-secondary !py-1.5 !text-xs" onClick={async () => {
              if (!(await confirmDialog("Muat data awal dari spreadsheet?", "Data yang sudah ada tidak akan ditimpa. Hanya entri baru yang ditambahkan.", "Muat"))) return;
              try { const r = await post<{ data: { imported: number } }>("/api/action", { action: "initial_import", payload: {} }); toast(`${r.data.imported} baris data awal ditambahkan`); }
              catch (e) { toast((e as Error).message, "error"); }
            }}>Muat data awal spreadsheet</button>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3 text-xs text-slate-400"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Data asli dipertahankan. <XCircle className="h-3.5 w-3.5 text-rose-500" /> Duplikat dan baris tidak valid ditandai, bukan dihapus.</div>
      {loading && <Loading label="Memproses data..." />}
    </div>
  );
}
