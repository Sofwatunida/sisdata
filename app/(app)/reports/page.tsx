"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileDown, FileText, Printer } from "lucide-react";
import { useApp } from "@/components/AppContext";
import { api } from "@/lib/client/api";
import { EmptyState, Loading, PageHeader, SearchBox, StatCard, useDebounce } from "@/components/ui";
import { divisionStats, formatNumber } from "@/lib/utils";
import type { Assignment } from "@/lib/types";

export default function ReportsPage() {
  const { divisions, periods, activePeriodId } = useApp();
  const [periodId, setPeriodId] = useState(activePeriodId);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const term = useDebounce(q);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("period_id");
    if (fromUrl) setPeriodId(fromUrl);
  }, []);
  useEffect(() => setPeriodId((prev) => prev || activePeriodId), [activePeriodId]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<{ data: Assignment[] }>(`/api/data/assignments?period_id=${periodId}`).then((r) => alive && setAssignments(r.data || [])).catch(() => undefined).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [periodId]);

  const stats = useMemo(() => divisionStats(divisions, assignments, periodId).filter((s) => !term || s.division.name.toLowerCase().includes(term.toLowerCase())), [divisions, assignments, periodId, term]);
  const total = stats.reduce((acc, s) => ({ required: acc.required + s.required, active: acc.active + s.active, lacking: acc.lacking + s.lacking, excess: acc.excess + s.excess }), { required: 0, active: 0, lacking: 0, excess: 0 });

  const exportLink = (type: string, format: string) => `/api/export?type=${type}&format=${format}&period_id=${periodId}`;

  return (
    <div>
      <PageHeader title="Rekapitulasi" description="Laporan kebutuhan, kekurangan, dan distribusi personil per bagian" />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="min-w-[200px]"><span className="label">Periode</span>
          <select className="input" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>{periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
        <div className="flex-1"><SearchBox value={q} onChange={setQ} placeholder="Cari nama bagian..." /></div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-secondary" href={exportLink("rekap", "xlsx")}><FileDown className="h-4 w-4" /> Rekap XLSX</a>
          <a className="btn-secondary" href={exportLink("rekap", "pdf")}><FileText className="h-4 w-4" /> Rekap PDF</a>
          <a className="btn-secondary" href={exportLink("needs", "xlsx")}><Printer className="h-4 w-4" /> Kebutuhan</a>
          <a className="btn-secondary" href={exportLink("personnel", "xlsx")}>Personil</a>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total Kebutuhan" value={formatNumber(total.required)} />
        <StatCard label="Personil Aktif" value={formatNumber(total.active)} />
        <StatCard label="Total Kekurangan" value={formatNumber(total.lacking)} />
        <StatCard label="Total Kelebihan" value={formatNumber(total.excess)} />
      </div>

      <div className="card overflow-hidden">
        {loading ? <Loading /> : stats.length === 0 ? <EmptyState /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>No</th><th>Nama Bagian</th><th>Penanggung Jawab</th><th className="text-right">Kebutuhan</th><th className="text-right">Terdaftar</th><th className="text-right">Aktif</th><th className="text-right">Kurang</th><th className="text-right">Lebih</th><th>Persentase</th></tr></thead>
              <tbody>
                {stats.map((s, i) => {
                  const pct = s.required ? Math.min(100, Math.round((s.active / s.required) * 100)) : 0;
                  return (
                    <tr key={s.division.id}>
                      <td className="text-slate-400">{i + 1}</td>
                      <td><Link href={`/divisions/${s.division.id}`} className="font-semibold text-navy-800 hover:underline">{s.division.name}</Link></td>
                      <td className="text-slate-600">{s.division.leader_name || "-"}</td>
                      <td className="text-right">{s.required}</td>
                      <td className="text-right text-slate-500">{s.registered}</td>
                      <td className="text-right font-semibold">{s.active}</td>
                      <td className="text-right">{s.lacking > 0 ? <span className="font-semibold text-amber-600">{s.lacking}</span> : "0"}</td>
                      <td className="text-right">{s.excess > 0 ? <span className="font-semibold text-blue-600">{s.excess}</span> : "0"}</td>
                      <td><div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-navy-700" style={{ width: `${pct}%` }} /></div><span className="text-xs text-slate-500">{s.required ? `${pct}%` : "-"}</span></div></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 font-bold text-navy-900"><tr><td colSpan={3}>TOTAL</td><td className="text-right">{total.required}</td><td className="text-right">-</td><td className="text-right">{total.active}</td><td className="text-right">{total.lacking}</td><td className="text-right">{total.excess}</td><td /></tr></tfoot>
            </table>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-400">Kekurangan = MAX(0, Kebutuhan − Personil Aktif). Personil aktif dihitung unik per bagian meski memiliki beberapa penugasan.</p>
    </div>
  );
}
