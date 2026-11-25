"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, Layers3, Pencil, Plus, Target, Users } from "lucide-react";
import { useApp } from "@/components/AppContext";
import { api, patch } from "@/lib/client/api";
import { Badge, EmptyState, Field, Loading, Modal, PageHeader, Pagination, SearchBox, StatCard, confirmDialog, toast, useDebounce } from "@/components/ui";
import { PersonnelForm } from "@/components/PersonnelForm";
import { divisionStats, formatNumber } from "@/lib/utils";
import type { Assignment, Division, Personnel } from "@/lib/types";

export default function DivisionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { divisions, bidangs, coordinators, user, refresh } = useApp();
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [divisionForm, setDivisionForm] = useState<Record<string, any>>({});
  const [q, setQ] = useState("");
  const term = useDebounce(q);
  const [page, setPage] = useState(1);
  const PER = 15;

  const load = async () => {
    setLoading(true);
    try {
      const [a, p] = await Promise.all([
        api<{ data: Assignment[] }>(`/api/data/assignments?division_id=${id}`),
        api<{ data: Personnel[] }>("/api/data/personnel"),
      ]);
      setAssignments(a.data || []); setPersonnel(p.data || []);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [id]);

  const division = divisions.find((d) => d.id === id);
  const bidang = bidangs.find((b) => b.id === division?.bidang_id);
  const coordinatorNames = coordinators.filter((c) => c.bidang_id === division?.bidang_id).map((c) => c.name || c.phone || "-").join(" · ");
  const openEdit = () => {
    if (!division) return;
    setDivisionForm({ ...division });
    setEditOpen(true);
  };
  async function saveDivision() {
    if (!String(divisionForm.name || "").trim()) { toast("Nama bagian wajib diisi", "error"); return; }
    try {
      await patch(`/api/data/divisions/${id}`, {
        name: String(divisionForm.name || ""),
        bidang_id: String(divisionForm.bidang_id || "") || null,
        leader_name: String(divisionForm.leader_name || ""),
        leader_phone: String(divisionForm.leader_phone || ""),
        coordinator_name: String(divisionForm.coordinator_name || ""),
        required_count: Number(divisionForm.required_count) || 0,
        notes: String(divisionForm.notes || ""),
        is_active: Boolean(divisionForm.is_active),
        is_archived: Boolean(divisionForm.is_archived),
      });
      toast("Informasi bagian diperbarui"); setEditOpen(false); await refresh();
    } catch (e) { toast((e as Error).message, "error"); }
  }
  async function toggleArchive() {
    if (!division) return;
    const next = !division.is_archived;
    if (!(await confirmDialog(next ? `Arsipkan "${division.name}"?` : `Aktifkan kembali "${division.name}"?`, "Data personil dan penugasan tidak dihapus.", next ? "Arsipkan" : "Aktifkan"))) return;
    try { await patch(`/api/data/divisions/${id}`, { is_archived: next }); toast(next ? "Bagian diarsipkan" : "Bagian diaktifkan"); await refresh(); }
    catch (e) { toast((e as Error).message, "error"); }
  }
  const stats = useMemo(() => division ? divisionStats([division], assignments)[0] : null, [division, assignments]);
  const rows = useMemo(() => {
    const t = term.toLowerCase();
    return assignments.filter((a) => a.status === "aktif")
      .map((a) => ({ assignment: a, person: personnel.find((p) => p.id === a.personnel_id) }))
      .filter((r) => r.person && (!t || [r.person.full_name, r.person.code, r.person.phone, r.person.korwil, r.person.origin, r.assignment.position_name].some((v) => (v || "").toLowerCase().includes(t))))
      .sort((a, b) => a.person!.full_name.localeCompare(b.person!.full_name));
  }, [assignments, personnel, term]);
  useEffect(() => setPage(1), [term]);
  const pageRows = rows.slice((page - 1) * PER, page * PER);

  if (loading) return <Loading />;
  if (!division || !stats) return <EmptyState title="Bagian tidak ditemukan" />;

  return (
    <div>
      <Link href="/divisions" className="mb-2 inline-flex min-h-[44px] items-center gap-1 text-sm text-slate-500 hover:text-navy-800 lg:mb-4 lg:min-h-0"><ArrowLeft className="h-4 w-4" /> Kembali ke daftar bagian</Link>
      <PageHeader title={division.name} description={`${division.code} · ${bidang ? `Bidang: ${bidang.name} · ` : ""}Penanggung jawab: ${division.leader_name || "-"}`}
        actions={<>
          <button className="btn-secondary" onClick={() => window.location.href = `/api/export?type=personnel&format=xlsx&division_id=${id}`}><Download className="h-4 w-4" /> Export</button>
          {user?.role === "admin" && <><button className="btn-secondary" onClick={() => void toggleArchive()}><Layers3 className="h-4 w-4" /> {division.is_archived ? "Aktifkan" : "Arsipkan"}</button><button className="btn-secondary" onClick={openEdit}><Pencil className="h-4 w-4" /> Edit</button></>}
          <button className="btn-primary" onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Tambah Personil</button>
        </>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Kebutuhan" value={stats.required} icon={<Target className="h-5 w-5" />} />
        <StatCard label="Personil Tersedia" value={stats.active} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Kekurangan" value={stats.lacking} hint="Maks(0, kebutuhan - aktif)" />
        <StatCard label="Kelebihan" value={stats.excess} hint="Maks(0, aktif - kebutuhan)" />
      </div>

      <div className="card mt-5 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-bold text-navy-900">Personil dalam Bagian</h2><p className="text-xs text-slate-500">{rows.length} penugasan aktif</p></div>
          <SearchBox value={q} onChange={setQ} placeholder="Cari personil..." />
        </div>
        {rows.length === 0 ? <EmptyState title="Belum ada personil" description="Tambahkan personil langsung dari halaman bagian ini." /> : (
          <>
            <ul className="divide-y divide-slate-100 lg:hidden">
              {pageRows.map((r) => (
                <li key={r.assignment.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/personnel/${r.person!.id}`} className="min-w-0 break-words font-semibold text-navy-800">{r.person!.full_name}</Link>
                    <span className="shrink-0 badge bg-navy-50 text-navy-700 ring-navy-200">{r.assignment.position_name}</span>
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">{r.person!.code}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{r.person!.korwil || r.person!.origin || "Asal belum diisi"}{r.person!.phone ? ` · ${r.person!.phone}` : ""}</p>
                  {r.assignment.notes && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{r.assignment.notes}</p>}
                  <Link href={`/personnel/${r.person!.id}`} className="btn-secondary mt-3 w-full !text-xs">Lihat detail</Link>
                </li>
              ))}
            </ul>
            <div className="table-wrap hidden lg:block">
              <table className="table">
                <thead><tr><th>No</th><th>ID Personil</th><th>Nama</th><th>Asal / Korwil</th><th>No. WhatsApp</th><th>Jabatan</th><th>Keterangan</th><th className="text-right">Aksi</th></tr></thead>
                <tbody>
                  {pageRows.map((r, i) => (
                    <tr key={r.assignment.id}>
                      <td className="text-slate-400">{(page - 1) * PER + i + 1}</td>
                      <td className="font-mono text-xs text-slate-500">{r.person!.code}</td>
                      <td><Link href={`/personnel/${r.person!.id}`} className="font-semibold text-navy-800 hover:underline">{r.person!.full_name}</Link></td>
                      <td>{r.person!.korwil || r.person!.origin || "-"}</td>
                      <td>{r.person!.phone || "-"}</td>
                      <td>{r.assignment.position_name}</td>
                      <td className="max-w-[220px] truncate text-slate-500">{r.assignment.notes || "-"}</td>
                      <td className="text-right"><Link href={`/personnel/${r.person!.id}`} className="text-xs font-semibold text-navy-700 hover:underline">Detail</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={rows.length} perPage={PER} onChange={setPage} />
          </>
        )}
      </div>

      <div className="card mt-5 p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-bold text-navy-900">Informasi Bagian</h2>
          <Badge status={division.is_archived ? "nonaktif" : division.is_active ? "aktif" : "nonaktif"} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bidang induk"><input className="input" value={bidang?.name || "-"} readOnly /></Field>
          <Field label="Penanggung jawab"><input className="input" value={division.leader_name || "-"} readOnly /></Field>
          <Field label="No. WhatsApp ketua"><input className="input" value={division.leader_phone || "-"} readOnly /></Field>
          <Field label="Ketua / koordinator bidang"><input className="input" value={coordinatorNames || division.coordinator_name || "-"} readOnly /></Field>
          <Field label="Kategori"><input className="input" value={division.category || "-"} readOnly /></Field>
          <Field label="Sumber data"><input className="input" value={division.source_file || division.source_sheet || "Input aplikasi"} readOnly /></Field>
          <div className="sm:col-span-2"><Field label="Keterangan"><input className="input" value={division.notes || "-"} readOnly /></Field></div>
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit Bagian · ${division.code}`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Nama bagian *"><input className="input" value={String(divisionForm.name || "")} onChange={(e) => setDivisionForm({ ...divisionForm, name: e.target.value })} /></Field></div>
          <div className="sm:col-span-2"><Field label="Bidang induk"><select className="input" value={String(divisionForm.bidang_id || "")} onChange={(e) => setDivisionForm({ ...divisionForm, bidang_id: e.target.value })}><option value="">Tanpa bidang</option>{bidangs.filter((b) => b.period_id === division.period_id).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field></div>
          <Field label="Penanggung jawab"><input className="input" value={String(divisionForm.leader_name || "")} onChange={(e) => setDivisionForm({ ...divisionForm, leader_name: e.target.value })} /></Field>
          <Field label="No. WhatsApp ketua"><input className="input" value={String(divisionForm.leader_phone || "")} onChange={(e) => setDivisionForm({ ...divisionForm, leader_phone: e.target.value })} /></Field>
          <Field label="Koordinator (legacy)"><input className="input" value={String(divisionForm.coordinator_name || "")} onChange={(e) => setDivisionForm({ ...divisionForm, coordinator_name: e.target.value })} /></Field>
          <Field label="Kebutuhan personil"><input className="input" type="number" min="0" value={Number(divisionForm.required_count) || 0} onChange={(e) => setDivisionForm({ ...divisionForm, required_count: Number(e.target.value) })} /></Field>
          <div className="sm:col-span-2"><Field label="Keterangan"><textarea className="input" value={String(divisionForm.notes || "")} onChange={(e) => setDivisionForm({ ...divisionForm, notes: e.target.value })} /></Field></div>
        </div>
        <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none"><button className="btn-secondary" onClick={() => setEditOpen(false)}>Batal</button><button className="btn-primary" onClick={() => void saveDivision()}>Simpan</button></div>
      </Modal>

      <PersonnelForm open={formOpen} onClose={() => setFormOpen(false)} defaultDivisionId={id} defaultPeriodId={division.period_id} onSaved={async () => { await load(); await refresh(); }} />
      <p className="mt-3 text-xs text-slate-400">Total penugasan tercatat: {formatNumber(assignments.length)}</p>
    </div>
  );
}
