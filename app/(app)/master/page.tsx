"use client";

import { useEffect, useMemo, useState } from "react";
import { Database, Pencil, Plus, Trash2 } from "lucide-react";
import { api, patch, del, post } from "@/lib/client/api";
import { EmptyState, Field, Loading, Modal, PageHeader, SearchBox, confirmDialog, toast, useDebounce } from "@/components/ui";
import { Badge } from "@/components/ui";
import type { MasterData } from "@/lib/types";

const TYPES = ["asal_daerah", "korwil", "jabatan", "status_personil", "status_penugasan", "kategori_divisi", "jenis_acara", "kategori_pekerjaan", "penanggung_jawab", "koordinator", "nama_bagian"];

export default function MasterPage() {
  const [rows, setRows] = useState<MasterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("korwil");
  const [q, setQ] = useState("");
  const term = useDebounce(q);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MasterData | null>(null);
  const [form, setForm] = useState({ type: "korwil", value: "", is_active: true });

  const load = async () => {
    setLoading(true);
    try { const r = await api<{ data: MasterData[] }>("/api/data/master_data"); setRows(r.data || []); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => rows.filter((r) => r.type === type && (!term || r.value.toLowerCase().includes(term.toLowerCase()))).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.value.localeCompare(b.value)), [rows, type, term]);

  async function save() {
    if (!form.value.trim()) { toast("Nilai wajib diisi", "error"); return; }
    try {
      if (editing) await patch(`/api/data/master_data/${editing.id}`, form);
      else await post("/api/data/master_data", form);
      toast("Data master disimpan"); setOpen(false); await load();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  async function remove(r: MasterData) {
    if (!(await confirmDialog(`Hapus "${r.value}" dari data master?`, "Pilihan yang sudah dipakai personil tetap tersimpan pada data terkait.", "Hapus"))) return;
    try { await del(`/api/data/master_data/${r.id}`); toast("Dihapus"); await load(); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  return (
    <div>
      <PageHeader title="Data Master" description="Kelola pilihan dinamis yang digunakan pada formulir dan filter"
        actions={<button className="btn-primary" onClick={() => { setEditing(null); setForm({ type, value: "", is_active: true }); setOpen(true); }}><Plus className="h-4 w-4" /> Tambah Data</button>} />
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <select className="input capitalize sm:!w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Jenis data master">{TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select>
          <SearchBox value={q} onChange={setQ} placeholder="Cari nilai master..." />
        </div>
        {loading ? <Loading /> : filtered.length === 0 ? <EmptyState title="Belum ada data master" /> : (
          <>
            <ul className="divide-y divide-slate-100 lg:hidden">
              {filtered.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold text-slate-800">{r.value}</p>
                    <p className="text-xs text-slate-500">{r.type.replace(/_/g, " ")}</p>
                  </div>
                  <Badge status={r.is_active ? "aktif" : "nonaktif"} />
                  <button className="icon-btn" onClick={() => { setEditing(r); setForm({ type: r.type, value: r.value, is_active: r.is_active }); setOpen(true); }} aria-label={`Edit ${r.value}`}><Pencil className="h-4 w-4" /></button>
                  <button className="icon-btn !text-rose-600 hover:!bg-rose-50" onClick={() => void remove(r)} aria-label={`Hapus ${r.value}`}><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
            <div className="table-wrap hidden lg:block"><table className="table">
              <thead><tr><th>No</th><th>Nilai</th><th>Jenis</th><th>Status</th><th className="text-right">Aksi</th></tr></thead>
              <tbody>{filtered.map((r, i) => <tr key={r.id}>
                <td className="text-slate-400">{i + 1}</td><td className="font-semibold">{r.value}</td><td className="text-xs text-slate-500">{r.type}</td>
                <td><Badge status={r.is_active ? "aktif" : "nonaktif"} /></td>
                <td className="text-right"><button className="icon-btn" onClick={() => { setEditing(r); setForm({ type: r.type, value: r.value, is_active: r.is_active }); setOpen(true); }} title="Edit"><Pencil className="h-4 w-4" /></button><button className="icon-btn !text-rose-600 hover:!bg-rose-50" onClick={() => void remove(r)} title="Hapus"><Trash2 className="h-4 w-4" /></button></td>
              </tr>)}</tbody>
            </table></div>
          </>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Data Master" : "Tambah Data Master"} size="sm">
        <div className="space-y-3">
          <Field label="Jenis"><select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></Field>
          <Field label="Nilai *"><input className="input" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></Field>
          <Field label="Status"><select className="input" value={form.is_active ? "aktif" : "nonaktif"} onChange={(e) => setForm({ ...form, is_active: e.target.value === "aktif" })}><option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option></select></Field>
          <div className="flex gap-2 pt-2 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none"><button className="btn-secondary" onClick={() => setOpen(false)}>Batal</button><button className="btn-primary" onClick={() => void save()}>Simpan</button></div>
        </div>
      </Modal>
      <p className="mt-3 text-xs text-slate-400"><Database className="mr-1 inline h-3 w-3" />{rows.length} nilai master tersedia dan digunakan sebagai dropdown dinamis.</p>
    </div>
  );
}
