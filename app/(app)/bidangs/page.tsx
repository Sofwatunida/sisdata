"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, Layers3, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useApp } from "@/components/AppContext";
import { api, del, patch, post } from "@/lib/client/api";
import { Badge, EmptyState, Field, Loading, Modal, PageHeader, StatCard, confirmDialog, toast } from "@/components/ui";
import { organizationStats } from "@/lib/organization";
import { formatNumber } from "@/lib/utils";
import type { Assignment, Bidang, Personnel } from "@/lib/types";

export default function BidangsPage() {
  const { bidangs, coordinators, divisions, activePeriodId, periods, user, refresh } = useApp();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Bidang | null>(null);
  const [form, setForm] = useState({ name: "", notes: "" });
  const [importing, setImporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [a, p] = await Promise.all([
        api<{ data: Assignment[] }>(`/api/data/assignments?period_id=${activePeriodId}`),
        api<{ data: Personnel[] }>("/api/data/personnel"),
      ]);
      setAssignments(a.data || []); setPersonnel(p.data || []);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [activePeriodId]);

  const stats = useMemo(
    () => organizationStats(bidangs, coordinators, divisions, assignments, personnel, activePeriodId),
    [bidangs, coordinators, divisions, assignments, personnel, activePeriodId],
  );
  const period = periods.find((p) => p.id === activePeriodId);

  const openForm = (b?: Bidang) => {
    setEditing(b || null);
    setForm({ name: b?.name || "", notes: b?.notes || "" });
    setOpen(true);
  };

  async function save() {
    if (!form.name.trim()) { toast("Nama bidang wajib diisi", "error"); return; }
    try {
      const payload = { name: form.name.trim(), notes: form.notes, period_id: activePeriodId };
      if (editing) await patch(`/api/data/bidangs/${editing.id}`, { name: payload.name, notes: payload.notes });
      else await post("/api/data/bidangs", { ...payload, sort_order: stats.totalBidang + 1 });
      toast(editing ? "Bidang diperbarui" : "Bidang ditambahkan");
      setOpen(false); await refresh();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  async function remove(b: Bidang) {
    if (!(await confirmDialog(`Hapus bidang "${b.name}"?`, "Bidang hanya dapat dihapus jika tidak memiliki divisi aktif.", "Hapus"))) return;
    try { await del(`/api/data/bidangs/${b.id}`); toast("Bidang dihapus"); await refresh(); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  async function importStructure() {
    if (!(await confirmDialog("Impor struktur Haul Imam Al Ghazali 2026?", "Periode baru akan dibuat. Data periode sebelumnya tidak diubah.", "Impor sekarang"))) return;
    setImporting(true);
    try {
      const res = await post<{ data: { existing: boolean; period: { id: string }; bidangs: number; divisions: number } }>("/api/action", { action: "import_organization_structure", payload: { activate: true } });
      toast(res.data.existing ? "Struktur periode ini sudah ada" : `Impor selesai: ${res.data.bidangs} bidang, ${res.data.divisions} divisi`);
      await refresh();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setImporting(false); }
  }

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Bidang & Divisi"
        description={`Struktur organisasi bertingkat · ${period?.name || "-"}`}
        actions={user?.role === "admin" ? <button className="btn-primary" disabled={importing} onClick={() => void importStructure()}><Upload className="h-4 w-4" /> {importing ? "Mengimpor..." : "Impor struktur 2026"}</button> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total Bidang" value={stats.totalBidang} icon={<Layers3 className="h-5 w-5" />} />
        <StatCard label="Total Divisi" value={stats.totalDivisi} icon={<Building2 className="h-5 w-5" />} />
        <StatCard label="Ketua Koordinator" value={stats.totalKoordinator} />
        <StatCard label="Ketua Divisi" value={stats.totalKetuaDivisi} />
        <StatCard label="Total Anggota" value={stats.totalAnggota} />
        <StatCard label="Tanpa Ketua" value={stats.tanpaKetua.length} hint="Divisi belum memiliki ketua" />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stats.byBidang.map((row) => (
          <div key={row.bidang.id} className="card flex flex-col p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/bidangs/${row.bidang.id}`} className="break-words font-bold text-navy-900 hover:underline">{row.bidang.name}</Link>
                <p className="mt-1 truncate text-xs text-slate-500">{row.coordinators.map((c) => c.name || c.phone || "-").join(" · ") || "Koordinator belum diisi"}</p>
              </div>
              <Badge status="aktif">{row.totalDivisi} divisi</Badge>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-center">
              <div><p className="text-[11px] text-slate-500">Divisi</p><p className="text-sm font-bold text-navy-900">{formatNumber(row.totalDivisi)}</p></div>
              <div><p className="text-[11px] text-slate-500">Anggota</p><p className="text-sm font-bold text-navy-900">{formatNumber(row.totalAnggota)}</p></div>
              <div><p className="text-[11px] text-slate-500">Tanpa PJ</p><p className="text-sm font-bold text-amber-600">{formatNumber(row.tanpaKetua)}</p></div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Link href={`/bidangs/${row.bidang.id}`} className="btn-secondary flex-1 !text-xs"><ArrowRight className="h-4 w-4" /> Detail bidang</Link>
              {user?.role === "admin" && <>
                <button className="icon-btn border border-slate-200" onClick={() => openForm(row.bidang)} aria-label={`Edit ${row.bidang.name}`}><Pencil className="h-4 w-4" /></button>
                <button className="icon-btn border border-slate-200 !text-rose-600 hover:!bg-rose-50" onClick={() => void remove(row.bidang)} aria-label={`Hapus ${row.bidang.name}`}><Trash2 className="h-4 w-4" /></button>
              </>}
            </div>
          </div>
        ))}
        {stats.byBidang.length === 0 && <div className="md:col-span-2 xl:col-span-3"><EmptyState title="Belum ada bidang pada periode ini" description="Tambahkan bidang atau impor struktur organisasi dari PDF." /></div>}
      </div>

      {user?.role === "admin" && <button onClick={() => openForm()} className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-sm font-semibold text-slate-500 transition hover:border-navy-400 hover:text-navy-700"><Plus className="h-4 w-4" /> Tambah bidang</button>}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit Bidang · ${editing.name}` : "Tambah Bidang"} size="sm">
        <div className="space-y-3">
          <Field label="Nama bidang *"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Keterangan"><textarea className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none">
          <button className="btn-secondary" onClick={() => setOpen(false)}>Batal</button>
          <button className="btn-primary" onClick={() => void save()}>Simpan</button>
        </div>
      </Modal>
    </div>
  );
}
