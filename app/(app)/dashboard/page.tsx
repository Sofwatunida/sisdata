"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, Boxes, CircleAlert, CircleCheck, Users, UserRoundCheck, UserRoundX, Target } from "lucide-react";
import { useApp } from "@/components/AppContext";
import { api } from "@/lib/client/api";
import { Loading, PageHeader, StatCard, Badge, EmptyState } from "@/components/ui";
import { dashboardNumbers, formatDateTime } from "@/lib/utils";
import { organizationStats } from "@/lib/organization";
import type { ActivityLog, Assignment, Personnel } from "@/lib/types";

export default function DashboardPage() {
  const { divisions, bidangs, coordinators, activePeriodId, periods } = useApp();
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api<{ data: Personnel[] }>("/api/data/personnel"),
      api<{ data: Assignment[] }>(`/api/data/assignments?period_id=${activePeriodId}`),
      api<{ data: ActivityLog[] }>("/api/data/activity_logs"),
    ]).then(([p, a, l]) => {
      if (!alive) return;
      setPersonnel(p.data || []); setAssignments(a.data || []); setLogs((l.data || []).slice(0, 8));
    }).catch(() => undefined).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [activePeriodId]);

  const n = useMemo(() => dashboardNumbers(divisions, assignments, personnel, activePeriodId), [divisions, assignments, personnel, activePeriodId]);
  const org = useMemo(() => organizationStats(bidangs, coordinators, divisions, assignments, personnel, activePeriodId), [bidangs, coordinators, divisions, assignments, personnel, activePeriodId]);
  const max = Math.max(1, ...n.stats.map((s) => s.active));
  const top = [...n.stats].sort((a, b) => b.active - a.active).slice(0, 6);
  const lacking = [...n.stats].filter((s) => s.lacking > 0).sort((a, b) => b.lacking - a.lacking).slice(0, 6);
  const period = periods.find((p) => p.id === activePeriodId);

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Ringkasan kondisi pendataan${period ? ` · ${period.name}` : ""}`}
        actions={<Link href="/reports" className="btn-secondary">Lihat rekap <ArrowRight className="h-4 w-4" /></Link>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total Personil" value={n.totalPersonnel} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Total Bagian" value={n.totalDivisions} icon={<Boxes className="h-5 w-5" />} />
        <StatCard label="Personil Aktif" value={n.activePersonnel} icon={<UserRoundCheck className="h-5 w-5" />} />
        <StatCard label="Belum Ditempatkan" value={n.unassigned} icon={<UserRoundX className="h-5 w-5" />} />
        <StatCard label="Total Kebutuhan" value={n.totalRequired} icon={<Target className="h-5 w-5" />} />
        <StatCard label="Kekurangan" value={n.totalLacking} icon={<CircleAlert className="h-5 w-5" />} />
      </div>

      <div className="card mt-5 p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-navy-900">Struktur Organisasi</h2>
            <p className="text-xs text-slate-500">Rekap bidang, koordinator, ketua divisi, dan anggota pada periode aktif</p>
          </div>
          <Link href="/bidangs" className="inline-flex min-h-[44px] items-center text-xs font-semibold text-navy-700 hover:underline lg:min-h-0">Lihat semua bidang</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Bidang" value={org.totalBidang} />
          <StatCard label="Divisi" value={org.totalDivisi} />
          <StatCard label="Ketua Koordinator" value={org.totalKoordinator} />
          <StatCard label="Ketua Divisi" value={org.totalKetuaDivisi} />
          <StatCard label="Anggota" value={org.totalAnggota} />
          <StatCard label="Divisi Tanpa Ketua" value={org.tanpaKetua.length} />
        </div>
        {org.byBidang.length > 0 && <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {org.byBidang.slice(0, 6).map((row) => (
            <Link key={row.bidang.id} href={`/bidangs/${row.bidang.id}`} className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 hover:border-navy-200 hover:bg-navy-50/40">
              <span className="truncate text-sm text-slate-700">{row.bidang.name}</span>
              <span className="shrink-0 text-xs font-semibold text-navy-700">{row.totalDivisi} divisi · {row.totalAnggota} anggota</span>
            </Link>
          ))}
        </div>}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <div className="card p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-navy-900">Distribusi Personil per Bagian</h2>
              <p className="text-xs text-slate-500">Jumlah personil aktif berdasarkan data penugasan</p>
            </div>
            <Link href="/divisions" className="inline-flex min-h-[44px] items-center text-xs font-semibold text-navy-700 hover:underline lg:min-h-0">Semua bagian</Link>
          </div>
          {top.length === 0 ? <EmptyState /> : (
            <div className="space-y-3">
              {top.map((s) => (
                <div key={s.division.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-slate-700">{s.division.name}</span>
                      <span className="shrink-0 text-xs font-semibold text-slate-600">{s.active}/{s.required || "-"}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className={s.lacking > 0 ? "h-full rounded-full bg-amber-400" : "h-full rounded-full bg-navy-700"} style={{ width: `${Math.min(100, (s.active / max) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-bold text-navy-900">Bagian Paling Kekurangan</h2>
          <p className="mb-4 text-xs text-slate-500">Berdasarkan target kebutuhan personil</p>
          {lacking.length === 0 ? <EmptyState title="Semua kebutuhan terpenuhi" /> : (
            <div className="space-y-2.5">
              {lacking.map((s) => (
                <Link key={s.division.id} href={`/divisions/${s.division.id}`} className="flex min-h-[44px] items-center justify-between rounded-lg border border-slate-100 px-3 py-2 hover:border-navy-200 hover:bg-navy-50/40">
                  <span className="truncate pr-2 text-sm text-slate-700">{s.division.name}</span>
                  <span className="shrink-0 badge bg-amber-50 text-amber-700 ring-amber-200">-{s.lacking}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card mt-5 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
          <Activity className="h-4 w-4 text-navy-700" />
          <h2 className="font-bold text-navy-900">Aktivitas Terbaru</h2>
          <Link href="/activity" className="ml-auto inline-flex min-h-[44px] items-center text-xs font-semibold text-navy-700 hover:underline lg:min-h-0">Lihat semua</Link>
        </div>
        {logs.length === 0 ? <EmptyState title="Belum ada aktivitas" /> : (
          <ul className="divide-y divide-slate-100">
            {logs.map((log) => (
              <li key={log.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <Badge status={log.action}>{log.action}</Badge>
                  <div>
                    <p className="text-sm text-slate-700">{log.description}</p>
                    <p className="text-xs text-slate-400">{log.actor_name}</p>
                  </div>
                </div>
                <span className="shrink-0 text-xs text-slate-400">{formatDateTime(log.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-emerald-600"><CircleCheck className="h-3.5 w-3.5" /> Seluruh angka dihitung otomatis dari database.</p>
    </div>
  );
}
