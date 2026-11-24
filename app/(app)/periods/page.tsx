"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarRange, Copy, Pencil, Plus } from "lucide-react";
import { useApp } from "@/components/AppContext";
import { api, post } from "@/lib/client/api";
import { Badge, Field, Modal, PageHeader, confirmDialog, toast } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default function PeriodsPage() {
  const { user, periods, activePeriodId, setActivePeriodId, refresh, divisions } = useApp();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [editing, setEditing] = useState("");
  const [form, setForm] = useState<Record<string, unknown>>({ name: "", year: new Date().getFullYear(), start_date: "", end_date: "", status: "draft", description: "", copy_divisions: true, copy_requirements: true, copy_leaders: true, copy_supervisors: true, copy_assignments: false });
  const [saving, setSaving] = useState(false);

  const periodPayload = () => ({
    name: String(form.name || "").trim(),
    year: String(form.year || "").trim(),
    start_date: String(form.start_date || ""),
    end_date: String(form.end_date || ""),
    status: String(form.status || "draft"),
    description: String(form.description || ""),
  });

  const openNew = () => {
    setSource("");
    setEditing("");
    setForm({ name: "", year: new Date().getFullYear(), start_date: "", end_date: "", status: "draft", description: "" });
    setOpen(true);
  };

  const openEdit = (id: string) => {
    const p = periods.find((x) => x.id === id);
    if (!p) return;
    setSource("");
    setEditing(id);
    setForm({ ...p });
    setOpen(true);
  };

  const openClone = (id: string) => {
    const p = periods.find((x) => x.id === id);
    setSource(id);
    setEditing("");
    setForm({
      name: `${p?.name || "Acara"} (salinan)`,
      year: Number(p?.year || new Date().getFullYear()) + 1,
      start_date: "", end_date: "", status: "draft", description: "",
      copy_divisions: true, copy_requirements: true, copy_leaders: true, copy_supervisors: true, copy_assignments: false,
    });
    setOpen(true);
  };

  async function save() {
    if (!String(form.name || "").trim()) { toast("Nama periode wajib diisi", "error"); return; }
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/data/periods/${editing}`, { method: "PATCH", body: JSON.stringify(periodPayload()) });
      } else if (source) {
        if (!(await confirmDialog("Salin struktur periode?", "Penugasan personil tidak akan disalin kecuali Anda memilihnya."))) return;
        await post("/api/action", { action: "clone_period", payload: { source_period_id: source, ...form } });
      } else {
        await api("/api/data/periods", { method: "POST", body: JSON.stringify(periodPayload()) });
      }
      toast(editing ? "Periode diperbarui" : source ? "Periode baru berhasil dibuat" : "Periode ditambahkan");
      setOpen(false); setSource(""); setEditing(""); await refresh();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setSaving(false); }
  }

  async function setActive(id: string) {
    setActivePeriodId(id);
    toast("Periode aktif diubah");
  }

  return (
    <div>
      <PageHeader title="Periode / Acara" description="Setiap periode memiliki data divisi, kebutuhan, dan penugasan tersendiri"
        actions={<button className="btn-primary" onClick={openNew}><Plus className="h-4 w-4" /> Periode Baru</button>} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {periods.map((p) => {
          const count = divisions.filter((d) => d.period_id === p.id).length;
          return (
            <div key={p.id} className={`card p-5 ${activePeriodId === p.id ? "ring-2 ring-navy-600" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2"><CalendarRange className="h-5 w-5 text-navy-700" /><h2 className="font-bold text-navy-900">{p.name}</h2></div>
                <Badge status={p.status}>{p.status}</Badge>
              </div>
              <p className="mt-3 text-sm text-slate-600">Tahun: {p.year} · {count} bagian</p>
              <p className="mt-1 text-xs text-slate-500">Pelaksanaan: {formatDate(p.start_date)}{p.end_date ? ` – ${formatDate(p.end_date)}` : ""}</p>
              {p.description && <p className="mt-2 line-clamp-2 text-xs text-slate-400">{p.description}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-secondary !py-1.5 !text-xs" onClick={() => void setActive(p.id)} disabled={activePeriodId === p.id}>{activePeriodId === p.id ? "Periode aktif" : "Jadikan aktif"}</button>
                {user?.role === "admin" && <button className="btn-secondary !py-1.5 !text-xs" onClick={() => openEdit(p.id)}><Pencil className="h-3.5 w-3.5" /> Edit</button>}
                <button className="btn-secondary !py-1.5 !text-xs" onClick={() => openClone(p.id)}><Copy className="h-3.5 w-3.5" /> Salin struktur</button>
                <Link href={`/reports?period_id=${p.id}`} className="btn-secondary !py-1.5 !text-xs">Lihat rekap</Link>
              </div>
            </div>
          );
        })}
        <button onClick={openNew} className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-navy-400 hover:text-navy-700">
          <Plus className="mb-2 h-6 w-6" /><span className="text-sm font-semibold">Tambah periode baru</span>
        </button>
      </div>

      <Modal open={open} onClose={() => { setOpen(false); setSource(""); setEditing(""); }} title={editing ? `Edit Periode · ${periods.find((p) => p.id === editing)?.name || ""}` : source ? `Salin struktur dari ${periods.find((p) => p.id === source)?.name}` : "Periode / Acara Baru"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Nama acara *"><input className="input" value={String(form.name || "")} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field></div>
          <Field label="Tahun / periode"><input className="input" value={String(form.year || "")} onChange={(e) => setForm({ ...form, year: e.target.value })} /></Field>
          <Field label="Status"><select className="input" value={String(form.status)} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="draft">Draft</option><option value="aktif">Aktif</option><option value="selesai">Selesai</option><option value="arsip">Arsip</option></select></Field>
          <Field label="Tanggal mulai"><input className="input" type="date" value={String(form.start_date || "")} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
          <Field label="Tanggal selesai"><input className="input" type="date" value={String(form.end_date || "")} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Keterangan"><textarea className="input" value={String(form.description || "")} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field></div>
        </div>
        {source && (
          <div className="mt-4 rounded-lg bg-slate-50 p-4">
            <p className="mb-2 text-sm font-semibold text-navy-900">Pilihan yang disalin:</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[["copy_divisions", "Daftar divisi"], ["copy_requirements", "Kebutuhan personil"], ["copy_leaders", "Penanggung jawab"], ["copy_supervisors", "Data pengawasan"], ["copy_assignments", "Penugasan personil (opsional)"]].map(([key, label]) => (
                <label key={key} className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-slate-600 lg:min-h-0">
                  <input type="checkbox" className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" checked={Boolean(form[key])} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} /> {label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Secara default penugasan personil tidak disalin agar data periode lama tidak berubah.</p>
          </div>
        )}
        <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none"><button className="btn-secondary" onClick={() => { setOpen(false); setSource(""); setEditing(""); }}>Batal</button><button className="btn-primary" disabled={saving} onClick={() => void save()}>{saving ? "Memproses..." : "Simpan"}</button></div>
      </Modal>
    </div>
  );
}
