"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Boxes, Eye, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useApp } from "@/components/AppContext";
import { api, del, post, patch } from "@/lib/client/api";
import { Badge, EmptyState, Field, Loading, Modal, PageHeader, SearchBox, confirmDialog, toast, useDebounce } from "@/components/ui";
import type { Assignment, Division, MasterData } from "@/lib/types";
import { divisionStats, formatNumber } from "@/lib/utils";

export default function DivisionsPage() {
  const { activePeriodId, periods, refresh } = useApp();
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [master, setMaster] = useState<MasterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const term = useDebounce(q);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Division | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [d, a, m] = await Promise.all([
        api<{ data: Division[] }>(`/api/data/divisions?period_id=${activePeriodId}`),
        api<{ data: Assignment[] }>(`/api/data/assignments?period_id=${activePeriodId}`),
        api<{ data: MasterData[] }>("/api/data/master_data"),
      ]);
      setDivisions(d.data || []); setAssignments(a.data || []); setMaster(m.data || []);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [activePeriodId]);

  const stats = useMemo(() => divisionStats(divisions, assignments), [divisions, assignments]);
  const filtered = stats.filter((s) => !term || [s.division.name, s.division.code, s.division.leader_name, s.division.coordinator_name].some((v) => (v || "").toLowerCase().includes(term.toLowerCase())));

  const openForm = (d?: Division) => {
    setEditing(d || null);
    setForm(d ? { ...d } : { period_id: activePeriodId, name: "", code: "", leader_name: "", coordinator_name: "", required_count: 0, category: "", notes: "", sort_order: divisions.length + 1, is_active: true });
    setOpen(true);
  };

  async function save() {
    if (!String(form.name || "").trim()) { toast("Nama bagian wajib diisi", "error"); return; }
    try {
      if (editing) await patch(`/api/data/divisions/${editing.id}`, form);
      else await post("/api/data/divisions", { ...form, code: form.code || `DIV-${String(divisions.length + 1).padStart(3, "0")}` });
      toast(editing ? "Bagian diperbarui" : "Bagian ditambahkan"); setOpen(false); await load(); await refresh();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  async function remove(d: Division) {
    if (!(await confirmDialog(`Hapus bagian "${d.name}"?`, "Bagian hanya bisa dihapus jika tidak memiliki personil aktif.", "Hapus"))) return;
    try { await del(`/api/data/divisions/${d.id}`); toast("Bagian dihapus"); await load(); await refresh(); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  const period = periods.find((p) => p.id === activePeriodId);

  return (
    <div>
      <PageHeader title="Bagian / Divisi" description={`Kelola struktur bagian periode ${period?.name || "-"}`}
        actions={<><button className="btn-secondary" onClick={() => window.location.href = `/api/export?type=needs&format=xlsx&period_id=${activePeriodId}`}>Export kebutuhan</button><button className="btn-primary" onClick={() => openForm()}><Plus className="h-4 w-4" /> Tambah Bagian</button></>} />

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 p-4"><SearchBox value={q} onChange={setQ} placeholder="Cari nama bagian, kode, atau penanggung jawab..." /></div>
        {loading ? <Loading /> : filtered.length === 0 ? <EmptyState title="Belum ada bagian" /> : (
          <>
            <ul className="divide-y divide-slate-100 lg:hidden">
              {filtered.map((s) => (
                <li key={s.division.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/divisions/${s.division.id}`} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center break-words font-semibold text-navy-800 lg:min-h-0">{s.division.name}</Link>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">{s.division.code}</p>
                    </div>
                    <Badge status={s.division.is_active ? "aktif" : "nonaktif"} />
                  </div>
                  <p className="mt-1.5 truncate text-xs text-slate-500">PJ: {s.division.leader_name || "-"} · Koordinator: {s.division.coordinator_name || "-"}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2 text-center">
                    <div><p className="text-[11px] text-slate-500">Kebutuhan</p><p className="text-sm font-bold text-navy-900">{formatNumber(s.required)}</p></div>
                    <div><p className="text-[11px] text-slate-500">Aktif</p><p className="text-sm font-bold text-navy-900">{formatNumber(s.active)}</p></div>
                    <div><p className="text-[11px] text-slate-500">Kurang</p><p className={s.lacking > 0 ? "text-sm font-bold text-amber-600" : "text-sm font-bold text-emerald-600"}>{formatNumber(s.lacking)}</p></div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Link href={`/divisions/${s.division.id}`} className="btn-secondary flex-1 !text-xs"><Eye className="h-4 w-4" /> Detail</Link>
                    <button className="icon-btn border border-slate-200" onClick={() => openForm(s.division)} aria-label={`Edit ${s.division.name}`}><Pencil className="h-4 w-4" /></button>
                    <button className="icon-btn border border-slate-200 !text-rose-600 hover:!bg-rose-50" onClick={() => void remove(s.division)} aria-label={`Hapus ${s.division.name}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-navy-900 lg:hidden">
              TOTAL ({filtered.length} bagian): kebutuhan {formatNumber(filtered.reduce((s, x) => s + x.required, 0))} · aktif {formatNumber(filtered.reduce((s, x) => s + x.active, 0))} · kurang {formatNumber(filtered.reduce((s, x) => s + x.lacking, 0))}
            </div>
            <div className="table-wrap hidden lg:block">
              <table className="table">
                <thead><tr><th>Kode</th><th>Nama Bagian</th><th>Penanggung Jawab</th><th>Koordinator</th><th className="text-right">Kebutuhan</th><th className="text-right">Aktif</th><th className="text-right">Kurang</th><th>Status</th><th className="text-right">Aksi</th></tr></thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.division.id}>
                      <td className="font-mono text-xs text-slate-500">{s.division.code}</td>
                      <td><Link href={`/divisions/${s.division.id}`} className="font-semibold text-navy-800 hover:underline">{s.division.name}</Link></td>
                      <td className="text-slate-600">{s.division.leader_name || "-"}</td>
                      <td className="text-slate-600">{s.division.coordinator_name || "-"}</td>
                      <td className="text-right">{formatNumber(s.required)}</td>
                      <td className="text-right font-semibold text-navy-800">{formatNumber(s.active)}</td>
                      <td className="text-right">{s.lacking > 0 ? <span className="font-semibold text-amber-600">{s.lacking}</span> : <span className="text-emerald-600">0</span>}</td>
                      <td><Badge status={s.division.is_active ? "aktif" : "nonaktif"} /></td>
                      <td className="whitespace-nowrap text-right">
                        <Link href={`/divisions/${s.division.id}`} className="icon-btn" title="Detail"><Eye className="h-4 w-4" /></Link>
                        <button className="icon-btn" onClick={() => openForm(s.division)} title="Edit"><Pencil className="h-4 w-4" /></button>
                        <button className="icon-btn !text-rose-600 hover:!bg-rose-50" onClick={() => void remove(s.division)} title="Hapus"><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-semibold text-navy-900">
                  <tr><td colSpan={4}>TOTAL ({filtered.length} bagian)</td><td className="text-right">{formatNumber(filtered.reduce((s, x) => s + x.required, 0))}</td><td className="text-right">{formatNumber(filtered.reduce((s, x) => s + x.active, 0))}</td><td className="text-right">{formatNumber(filtered.reduce((s, x) => s + x.lacking, 0))}</td><td colSpan={2}><Users className="mr-1 inline h-3.5 w-3.5" />Data real-time</td></tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit Bagian · ${editing.code}` : "Tambah Bagian / Divisi"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama bagian *"><input className="input" value={String(form.name || "")} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Kode bagian"><input className="input" value={String(form.code || "")} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Otomatis" /></Field>
          <Field label="Penanggung jawab"><input className="input" list="master-leaders" value={String(form.leader_name || "")} onChange={(e) => setForm({ ...form, leader_name: e.target.value })} /><datalist id="master-leaders">{master.filter((m) => m.type === "penanggung_jawab").map((m) => <option key={m.id} value={m.value} />)}</datalist></Field>
          <Field label="Ketua / koordinator"><input className="input" list="master-coords" value={String(form.coordinator_name || "")} onChange={(e) => setForm({ ...form, coordinator_name: e.target.value })} /><datalist id="master-coords">{master.filter((m) => m.type === "koordinator").map((m) => <option key={m.id} value={m.value} />)}</datalist></Field>
          <Field label="Kategori"><input className="input" list="master-cats" value={String(form.category || "")} onChange={(e) => setForm({ ...form, category: e.target.value })} /><datalist id="master-cats">{master.filter((m) => m.type === "kategori_divisi").map((m) => <option key={m.id} value={m.value} />)}</datalist></Field>
          <Field label="Kebutuhan personil"><input className="input" type="number" inputMode="numeric" min="0" value={Number(form.required_count) || 0} onChange={(e) => setForm({ ...form, required_count: Number(e.target.value) })} /></Field>
          <div className="sm:col-span-2"><Field label="Keterangan"><textarea className="input" value={String(form.notes || "")} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field></div>
        </div>
        <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none"><button className="btn-secondary" onClick={() => setOpen(false)}>Batal</button><button className="btn-primary" onClick={() => void save()}>Simpan</button></div>
      </Modal>
      <p className="mt-3 text-xs text-slate-400"><Boxes className="mr-1 inline h-3 w-3" />Jumlah personil dihitung dari penugasan aktif yang unik, bukan dari baris spreadsheet.</p>
    </div>
  );
}
