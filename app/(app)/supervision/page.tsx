"use client";

import { useEffect, useState } from "react";
import { Download, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useApp } from "@/components/AppContext";
import { api, del, post, patch } from "@/lib/client/api";
import { EmptyState, Field, Loading, Modal, PageHeader, confirmDialog, toast } from "@/components/ui";
import type { Supervisor, WorkAssignment } from "@/lib/types";

export default function SupervisionPage() {
  const { activePeriodId } = useApp();
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [works, setWorks] = useState<WorkAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WorkAssignment | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [s, w] = await Promise.all([
        api<{ data: Supervisor[] }>(`/api/data/supervisors?period_id=${activePeriodId}`),
        api<{ data: WorkAssignment[] }>(`/api/data/work_assignments?period_id=${activePeriodId}`),
      ]);
      setSupervisors(s.data || []); setWorks(w.data || []);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [activePeriodId]);

  const openForm = (w?: WorkAssignment, supervisorId?: string) => {
    setEditing(w || null);
    setForm(w ? { ...w } : { name: "", notes: "", supervisor_id: supervisorId || supervisors[0]?.id || "", status: "aktif" });
    setOpen(true);
  };

  async function save() {
    if (!form.name?.trim()) { toast("Nama pekerjaan wajib diisi", "error"); return; }
    try {
      const body = { ...form, period_id: activePeriodId };
      if (editing) await patch(`/api/data/work_assignments/${editing.id}`, body);
      else await post("/api/data/work_assignments", body);
      toast("Data pengawasan disimpan"); setOpen(false); await load();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  async function remove(w: WorkAssignment) {
    if (!(await confirmDialog(`Hapus pekerjaan "${w.name}"?`))) return;
    try { await del(`/api/data/work_assignments/${w.id}`); toast("Dihapus"); await load(); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Data Pengawasan" description="Penanggung jawab pengawas panitia dan daftar pekerjaan yang diawasi"
        actions={<><button className="btn-secondary" onClick={() => window.location.href = `/api/export?type=supervision&format=xlsx&period_id=${activePeriodId}`}><Download className="h-4 w-4" /> Export</button><button className="btn-primary" onClick={() => openForm()}><Plus className="h-4 w-4" /> Tambah Pekerjaan</button></>} />

      {supervisors.length === 0 ? <EmptyState title="Belum ada data pengawasan" description="Data pengawas panitia akan muncul setelah import data awal atau ditambahkan manual." /> : (
        <div className="grid gap-5 lg:grid-cols-2">
          {supervisors.map((s) => {
            const list = works.filter((w) => w.supervisor_id === s.id);
            return (
              <div key={s.id} className="card overflow-hidden">
                <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50/60 px-4 py-4 sm:px-5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-100 text-navy-700"><ShieldCheck className="h-5 w-5" /></div>
                  <div className="min-w-0"><h2 className="break-words font-bold text-navy-900">{s.group_name}</h2><p className="truncate text-xs text-slate-500">Penanggung jawab: {s.name || "-"}</p></div>
                  <span className="ml-auto shrink-0 text-xs font-semibold text-slate-500">{list.length} pekerjaan</span>
                </div>
                {list.length === 0 ? <EmptyState title="Belum ada pekerjaan" /> : (
                  <ul className="divide-y divide-slate-100">
                    {list.map((w, i) => (
                      <li key={w.id} className="flex items-center gap-2 px-4 py-2 text-sm sm:gap-3 sm:px-5 sm:py-2.5">
                        <span className="w-5 shrink-0 text-xs text-slate-400">{i + 1}.</span>
                        <span className="min-w-0 flex-1 break-words font-medium text-slate-700">{w.name}</span>
                        <button className="icon-btn" onClick={() => openForm(w)} aria-label={`Edit ${w.name}`}><Pencil className="h-4 w-4" /></button>
                        <button className="icon-btn !text-rose-600 hover:!bg-rose-50" onClick={() => void remove(w)} aria-label={`Hapus ${w.name}`}><Trash2 className="h-4 w-4" /></button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="border-t border-slate-100 px-4 py-2 sm:px-5 sm:py-3"><button className="min-h-[44px] text-xs font-semibold text-navy-700 hover:underline lg:min-h-0" onClick={() => openForm(undefined, s.id)}>+ Tambah pekerjaan pada kelompok ini</button></div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Pekerjaan Pengawas" : "Tambah Pekerjaan Pengawas"} size="sm">
        <div className="space-y-3">
          <Field label="Kelompok pengawas"><select className="input" value={form.supervisor_id || ""} onChange={(e) => setForm({ ...form, supervisor_id: e.target.value })}>{supervisors.map((s) => <option key={s.id} value={s.id}>{s.group_name} · {s.name}</option>)}</select></Field>
          <Field label="Nama pekerjaan *"><input className="input" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Keterangan"><textarea className="input" value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="flex gap-2 pt-2 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none"><button className="btn-secondary" onClick={() => setOpen(false)}>Batal</button><button className="btn-primary" onClick={() => void save()}>Simpan</button></div>
        </div>
      </Modal>
    </div>
  );
}
