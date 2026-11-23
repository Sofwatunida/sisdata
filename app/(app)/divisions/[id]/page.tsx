"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, Plus, Target, Users } from "lucide-react";
import { useApp } from "@/components/AppContext";
import { api } from "@/lib/client/api";
import { EmptyState, Field, Loading, Modal, PageHeader, Pagination, StatCard, toast } from "@/components/ui";
import { PersonnelForm } from "@/components/PersonnelForm";
import { divisionStats, formatNumber } from "@/lib/utils";
import type { Assignment, Division, Personnel } from "@/lib/types";

export default function DivisionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { divisions, refresh } = useApp();
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [q, setQ] = useState("");
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
  const stats = useMemo(() => division ? divisionStats([division], assignments)[0] : null, [division, assignments]);
  const rows = useMemo(() => {
    const term = q.toLowerCase();
    return assignments.filter((a) => a.status === "aktif")
      .map((a) => ({ assignment: a, person: personnel.find((p) => p.id === a.personnel_id) }))
      .filter((r) => r.person && (!term || [r.person.full_name, r.person.code, r.person.phone, r.person.korwil, r.person.origin, r.assignment.position_name].some((v) => (v || "").toLowerCase().includes(term))))
      .sort((a, b) => a.person!.full_name.localeCompare(b.person!.full_name));
  }, [assignments, personnel, q]);
  const pageRows = rows.slice((page - 1) * PER, page * PER);

  if (loading) return <Loading />;
  if (!division || !stats) return <EmptyState title="Bagian tidak ditemukan" />;

  return (
    <div>
      <Link href="/divisions" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy-800"><ArrowLeft className="h-4 w-4" /> Kembali ke daftar bagian</Link>
      <PageHeader title={division.name} description={`${division.code} · Penanggung jawab: ${division.leader_name || "-"}`}
        actions={<><button className="btn-secondary" onClick={() => window.location.href = `/api/export?type=personnel&format=xlsx&division_id=${id}`}><Download className="h-4 w-4" /> Export</button><button className="btn-primary" onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Tambah Personil</button></>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Kebutuhan" value={stats.required} icon={<Target className="h-5 w-5" />} />
        <StatCard label="Personil Tersedia" value={stats.active} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Kekurangan" value={stats.lacking} hint="Maks(0, kebutuhan - aktif)" />
        <StatCard label="Kelebihan" value={stats.excess} hint="Maks(0, aktif - kebutuhan)" />
      </div>

      <div className="card mt-5 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-bold text-navy-900">Personil dalam Bagian</h2><p className="text-xs text-slate-500">{rows.length} penugasan aktif</p></div>
          <input className="input !w-full sm:!w-64" placeholder="Cari personil..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        {rows.length === 0 ? <EmptyState title="Belum ada personil" description="Tambahkan personil langsung dari halaman bagian ini." /> : (
          <>
            <div className="table-wrap">
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
        <h2 className="mb-3 font-bold text-navy-900">Informasi Bagian</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Penanggung jawab"><input className="input" value={division.leader_name || "-"} readOnly /></Field>
          <Field label="Ketua / koordinator"><input className="input" value={division.coordinator_name || "-"} readOnly /></Field>
          <Field label="Kategori"><input className="input" value={division.category || "-"} readOnly /></Field>
          <Field label="Sumber data"><input className="input" value={division.source_sheet || "Input aplikasi"} readOnly /></Field>
          <div className="sm:col-span-2"><Field label="Keterangan"><input className="input" value={division.notes || "-"} readOnly /></Field></div>
        </div>
      </div>

      <PersonnelForm open={formOpen} onClose={() => setFormOpen(false)} defaultDivisionId={id} defaultPeriodId={division.period_id} onSaved={async () => { await load(); await refresh(); }} />
      <p className="mt-3 text-xs text-slate-400">Total penugasan tercatat: {formatNumber(assignments.length)}</p>
    </div>
  );
}
