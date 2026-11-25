"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Building2, Layers3, Pencil, Phone, Plus, Trash2, Users } from "lucide-react";
import { useApp } from "@/components/AppContext";
import { api, del, patch, post } from "@/lib/client/api";
import { Badge, EmptyState, Field, Loading, Modal, PageHeader, StatCard, confirmDialog, toast } from "@/components/ui";
import { coordinatorLabel, leaderLabel, organizationStats } from "@/lib/organization";
import { formatNumber, normalizeDivisionName } from "@/lib/utils";
import type { Assignment, BidangCoordinator, Division, Personnel } from "@/lib/types";

export default function BidangDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { bidangs, coordinators, divisions, periods, activePeriodId, user, can, refresh } = useApp();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [coordOpen, setCoordOpen] = useState(false);
  const [divisionOpen, setDivisionOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [divisionForm, setDivisionForm] = useState<Record<string, any>>({});
  const [coordForm, setCoordForm] = useState<Record<string, any>>({});
  const [editBidang, setEditBidang] = useState({ name: "", notes: "", sort_order: 0 });

  const bidang = bidangs.find((b) => b.id === id);
  const period = periods.find((p) => p.id === (bidang?.period_id || activePeriodId));
  const scope = { bidangId: id, periodId: bidang?.period_id || activePeriodId };

  const load = async () => {
    setLoading(true);
    try {
      const periodId = bidang?.period_id || activePeriodId;
      const [a, p] = await Promise.all([
        api<{ data: Assignment[] }>(`/api/data/assignments?period_id=${periodId}`),
        api<{ data: Personnel[] }>("/api/data/personnel"),
      ]);
      setAssignments(a.data || []); setPersonnel(p.data || []);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [id, bidang?.period_id, activePeriodId]);

  const stats = useMemo(
    () => organizationStats(bidangs, coordinators, divisions, assignments, personnel, bidang?.period_id || activePeriodId),
    [bidangs, coordinators, divisions, assignments, personnel, bidang?.period_id, activePeriodId],
  );
  const row = stats.byBidang.find((r) => r.bidang.id === id);
  const fieldCoordinators = coordinators.filter((c) => c.bidang_id === id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const fieldDivisions = divisions.filter((d) => d.bidang_id === id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name));

  const openCoordinator = (c?: BidangCoordinator) => {
    setCoordForm(c ? { ...c } : { bidang_id: id, name: "", phone: "", notes: "", personnel_id: "", sort_order: fieldCoordinators.length + 1, is_active: true });
    setCoordOpen(true);
  };
  const openDivision = (d?: Division) => {
    setDivisionForm(d ? { ...d } : { bidang_id: id, period_id: bidang?.period_id || activePeriodId, name: "", code: "", leader_name: "", leader_phone: "", coordinator_name: fieldCoordinators[0] ? coordinatorLabel(fieldCoordinators[0], personnel) : "", required_count: 0, notes: "", sort_order: fieldDivisions.length + 1, is_active: true, is_archived: false });
    setDivisionOpen(true);
  };
  const openEdit = () => {
    setEditBidang({ name: bidang?.name || "", notes: bidang?.notes || "", sort_order: bidang?.sort_order || 0 });
    setEditOpen(true);
  };

  async function saveCoordinator() {
    if (!String(coordForm.name || "").trim() && !String(coordForm.phone || "").trim()) { toast("Nama atau nomor koordinator wajib diisi", "error"); return; }
    try {
      const payload = { ...coordForm, name: String(coordForm.name || ""), phone: String(coordForm.phone || ""), bidang_id: id };
      if (coordForm.id) await patch(`/api/data/bidang_coordinators/${coordForm.id}`, payload);
      else await post("/api/data/bidang_coordinators", payload);
      toast("Koordinator disimpan"); setCoordOpen(false); await refresh();
    } catch (e) { toast((e as Error).message, "error"); }
  }
  async function removeCoordinator(c: BidangCoordinator) {
    if (!(await confirmDialog(`Hapus koordinator "${coordinatorLabel(c, personnel)}"?`, "Data koordinator akan dihapus dari bidang ini.", "Hapus"))) return;
    try { await del(`/api/data/bidang_coordinators/${c.id}`); toast("Koordinator dihapus"); await refresh(); }
    catch (e) { toast((e as Error).message, "error"); }
  }
  async function saveDivision() {
    if (!String(divisionForm.name || "").trim()) { toast("Nama divisi wajib diisi", "error"); return; }
    try {
      const payload = { ...divisionForm, name: normalizeDivisionName(String(divisionForm.name)), leader_phone: String(divisionForm.leader_phone || ""), bidang_id: String(divisionForm.bidang_id || id) };
      if (divisionForm.id) await patch(`/api/data/divisions/${divisionForm.id}`, payload);
      else await post("/api/data/divisions", { ...payload, code: String(divisionForm.code || "").trim() || undefined });
      toast("Divisi disimpan"); setDivisionOpen(false); await load(); await refresh();
    } catch (e) { toast((e as Error).message, "error"); }
  }
  async function archiveDivision(d: Division) {
    const next = !d.is_archived;
    if (!(await confirmDialog(next ? `Arsipkan divisi "${d.name}"?` : `Aktifkan kembali divisi "${d.name}"?`, "Status arsip tidak menghapus data personil atau penugasan.", next ? "Arsipkan" : "Aktifkan"))) return;
    try { await patch(`/api/data/divisions/${d.id}`, { is_archived: next }); toast(next ? "Divisi diarsipkan" : "Divisi diaktifkan"); await refresh(); }
    catch (e) { toast((e as Error).message, "error"); }
  }
  async function saveBidang() {
    if (!editBidang.name.trim()) { toast("Nama bidang wajib diisi", "error"); return; }
    try { await patch(`/api/data/bidangs/${id}`, editBidang); toast("Bidang diperbarui"); setEditOpen(false); await refresh(); }
    catch (e) { toast((e as Error).message, "error"); }
  }
  async function removeBidang() {
    if (!(await confirmDialog(`Hapus bidang "${bidang?.name}"?`, "Semua divisi aktif harus dipindah atau diarsipkan terlebih dahulu.", "Hapus"))) return;
    try { await del(`/api/data/bidangs/${id}`); toast("Bidang dihapus"); window.location.href = "/bidangs"; }
    catch (e) { toast((e as Error).message, "error"); }
  }

  if (loading) return <Loading />;
  if (!bidang) return <EmptyState title="Bidang tidak ditemukan" description="Bidang mungkin sudah dihapus atau berada pada periode lain." />;

  return (
    <div>
      <Link href="/bidangs" className="mb-2 inline-flex min-h-[44px] items-center gap-1 text-sm text-slate-500 hover:text-navy-800 lg:mb-4 lg:min-h-0"><ArrowLeft className="h-4 w-4" /> Kembali ke daftar bidang</Link>
      <PageHeader
        title={bidang.name}
        description={`Bidang · ${period?.name || "-"}${bidang.source_file ? ` · Sumber: ${bidang.source_file}` : ""}`}
        actions={can("bidangs", "edit", scope) ? <button className="btn-secondary" onClick={openEdit}><Pencil className="h-4 w-4" /> Edit bidang</button> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total Divisi" value={row?.totalDivisi || 0} icon={<Layers3 className="h-5 w-5" />} />
        <StatCard label="Total Anggota" value={row?.totalAnggota || 0} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Ketua Koordinator" value={fieldCoordinators.length} />
        <StatCard label="Divisi Tanpa Ketua" value={row?.tanpaKetua || 0} hint="Belum memiliki ketua divisi" />
      </div>

      <div className="card mt-5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-navy-900">Ketua Koordinator Bidang</h2>
            <p className="text-xs text-slate-500">Nama dan nomor diambil dari PDF sumber; nomor tidak dibuat-buat.</p>
          </div>
          {can("bidang_coordinators", "create", scope) && <button className="btn-secondary !text-xs" onClick={() => openCoordinator()}><Plus className="h-4 w-4" /> Tambah koordinator</button>}
        </div>
        {fieldCoordinators.length === 0 ? <div className="mt-3"><EmptyState title="Koordinator belum diisi" /></div> : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {fieldCoordinators.map((c) => (
              <div key={c.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-navy-800">{coordinatorLabel(c, personnel) || "-"}</p>
                    <p className="mt-1 flex items-center gap-1 font-mono text-xs text-slate-600"><Phone className="h-3.5 w-3.5" /> {c.phone || "Nomor kosong"}</p>
                  </div>
                  {can("bidang_coordinators", "edit", scope) && <div className="flex shrink-0 gap-1">
                    <button className="icon-btn" onClick={() => openCoordinator(c)} aria-label="Edit koordinator"><Pencil className="h-3.5 w-3.5" /></button>
                    <button className="icon-btn !text-rose-600 hover:!bg-rose-50" onClick={() => void removeCoordinator(c)} aria-label="Hapus koordinator"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>}
                </div>
                {c.notes && <p className="mt-2 text-xs text-slate-500">{c.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card mt-5 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-bold text-navy-900">Daftar Divisi</h2><p className="text-xs text-slate-500">{fieldDivisions.length} divisi terdaftar · {fieldDivisions.filter((d) => !d.is_archived).length} aktif</p></div>
          {can("divisions", "create", scope) && <button className="btn-primary !text-xs" onClick={() => openDivision()}><Plus className="h-4 w-4" /> Tambah divisi</button>}
        </div>
        {fieldDivisions.length === 0 ? <EmptyState title="Belum ada divisi pada bidang ini" /> : (
          <>
            <ul className="divide-y divide-slate-100 lg:hidden">
              {fieldDivisions.map((d) => {
                const memberCount = assignments.filter((a) => a.division_id === d.id && a.status === "aktif").length;
                return (
                  <li key={d.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/divisions/${d.id}`} className="break-words font-semibold text-navy-800">{d.name}</Link>
                      <Badge status={d.is_archived ? "nonaktif" : d.is_active ? "aktif" : "nonaktif"} />
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate-500">{d.code}</p>
                    <p className="mt-1 truncate text-xs text-slate-600">Ketua: {leaderLabel(d, personnel) || "-"} · {d.leader_phone || "nomor kosong"}</p>
                    <p className="mt-1 text-xs text-slate-500">{memberCount} anggota aktif</p>
                    <div className="mt-3 flex gap-2">
                      <Link href={`/divisions/${d.id}`} className="btn-secondary flex-1 !text-xs">Detail</Link>
                      {can("divisions", "edit", scope) && <>
                        <button className="icon-btn border border-slate-200" onClick={() => openDivision(d)} aria-label="Edit divisi"><Pencil className="h-4 w-4" /></button>
                        <button className="icon-btn border border-slate-200" onClick={() => void archiveDivision(d)} aria-label="Ubah status divisi"><Layers3 className="h-4 w-4" /></button>
                      </>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="table-wrap hidden lg:block">
              <table className="table">
                <thead><tr><th>Kode</th><th>Nama Divisi</th><th>Ketua Divisi</th><th>No. WhatsApp</th><th className="text-right">Anggota</th><th>Status</th><th className="text-right">Aksi</th></tr></thead>
                <tbody>
                  {fieldDivisions.map((d) => (
                    <tr key={d.id} className={d.is_archived ? "opacity-60" : ""}>
                      <td className="font-mono text-xs text-slate-500">{d.code}</td>
                      <td><Link href={`/divisions/${d.id}`} className="font-semibold text-navy-800 hover:underline">{d.name}</Link></td>
                      <td className="text-slate-600">{leaderLabel(d, personnel) || "-"}</td>
                      <td className="font-mono text-xs text-slate-600">{d.leader_phone || "-"}</td>
                      <td className="text-right">{formatNumber(assignments.filter((a) => a.division_id === d.id && a.status === "aktif").length)}</td>
                      <td><Badge status={d.is_archived ? "nonaktif" : d.is_active ? "aktif" : "nonaktif"} /></td>
                      <td className="whitespace-nowrap text-right">
                        <Link href={`/divisions/${d.id}`} className="icon-btn" title="Detail"><Building2 className="h-4 w-4" /></Link>
                        {can("divisions", "edit", scope) && <>
                          <button className="icon-btn" onClick={() => openDivision(d)} title="Edit"><Pencil className="h-4 w-4" /></button>
                          <button className="icon-btn" onClick={() => void archiveDivision(d)} title={d.is_archived ? "Aktifkan" : "Arsipkan"}><Layers3 className="h-4 w-4" /></button>
                        </>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {can("bidangs", "delete", scope) && user?.role === "admin" && <button onClick={() => void removeBidang()} className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /> Hapus bidang ini</button>}

      <Modal open={coordOpen} onClose={() => setCoordOpen(false)} title={coordForm.id ? "Edit Koordinator" : "Tambah Koordinator"} size="sm">
        <div className="space-y-3">
          <Field label="Nama koordinator"><input className="input" value={String(coordForm.name || "")} onChange={(e) => setCoordForm({ ...coordForm, name: e.target.value })} /></Field>
          <Field label="No. WhatsApp"><input className="input" value={String(coordForm.phone || "")} onChange={(e) => setCoordForm({ ...coordForm, phone: e.target.value })} placeholder="08..." /></Field>
          <Field label="Keterangan"><textarea className="input" value={String(coordForm.notes || "")} onChange={(e) => setCoordForm({ ...coordForm, notes: e.target.value })} /></Field>
        </div>
        <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none"><button className="btn-secondary" onClick={() => setCoordOpen(false)}>Batal</button><button className="btn-primary" onClick={() => void saveCoordinator()}>Simpan</button></div>
      </Modal>

      <Modal open={divisionOpen} onClose={() => setDivisionOpen(false)} title={divisionForm.id ? `Edit Divisi · ${divisionForm.code || ""}` : "Tambah Divisi"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Nama divisi *"><input className="input" value={String(divisionForm.name || "")} onChange={(e) => setDivisionForm({ ...divisionForm, name: e.target.value })} /></Field></div>
          <Field label="Kode divisi"><input className="input" value={String(divisionForm.code || "")} onChange={(e) => setDivisionForm({ ...divisionForm, code: e.target.value })} placeholder="Otomatis" /></Field>
          <Field label="Bidang induk"><select className="input" value={String(divisionForm.bidang_id || id)} onChange={(e) => setDivisionForm({ ...divisionForm, bidang_id: e.target.value })}>{bidangs.filter((b) => b.period_id === (bidang?.period_id || activePeriodId)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Ketua divisi"><input className="input" value={String(divisionForm.leader_name || "")} onChange={(e) => setDivisionForm({ ...divisionForm, leader_name: e.target.value })} /></Field>
          <Field label="No. WhatsApp ketua"><input className="input" value={String(divisionForm.leader_phone || "")} onChange={(e) => setDivisionForm({ ...divisionForm, leader_phone: e.target.value })} placeholder="08..." /></Field>
          <Field label="Kebutuhan personil"><input className="input" type="number" min="0" value={Number(divisionForm.required_count) || 0} onChange={(e) => setDivisionForm({ ...divisionForm, required_count: Number(e.target.value) })} /></Field>
          <Field label="Status">
            <select className="input" value={String(divisionForm.is_archived ? "arsip" : divisionForm.is_active !== false ? "aktif" : "nonaktif")} onChange={(e) => setDivisionForm({ ...divisionForm, is_archived: e.target.value === "arsip", is_active: e.target.value !== "nonaktif" })}>
              <option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option><option value="arsip">Arsip</option>
            </select>
          </Field>
          <div className="sm:col-span-2"><Field label="Keterangan"><textarea className="input" value={String(divisionForm.notes || "")} onChange={(e) => setDivisionForm({ ...divisionForm, notes: e.target.value })} /></Field></div>
        </div>
        <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none"><button className="btn-secondary" onClick={() => setDivisionOpen(false)}>Batal</button><button className="btn-primary" onClick={() => void saveDivision()}>Simpan</button></div>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Bidang" size="sm">
        <div className="space-y-3">
          <Field label="Nama bidang *"><input className="input" value={editBidang.name} onChange={(e) => setEditBidang({ ...editBidang, name: e.target.value })} /></Field>
          <Field label="Keterangan"><textarea className="input" value={editBidang.notes} onChange={(e) => setEditBidang({ ...editBidang, notes: e.target.value })} /></Field>
        </div>
        <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none"><button className="btn-secondary" onClick={() => setEditOpen(false)}>Batal</button><button className="btn-primary" onClick={() => void saveBidang()}>Simpan</button></div>
      </Modal>
    </div>
  );
}
