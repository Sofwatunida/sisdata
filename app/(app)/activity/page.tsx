"use client";

import { useEffect, useMemo, useState } from "react";
import { History, Lock } from "lucide-react";
import { useApp } from "@/components/AppContext";
import { api } from "@/lib/client/api";
import { Badge, EmptyState, Loading, PageHeader, Pagination, SearchBox, useDebounce } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import type { ActivityLog } from "@/lib/types";

export default function ActivityPage() {
  const { divisions, user } = useApp();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const term = useDebounce(q);
  const [action, setAction] = useState("");
  const [division, setDivision] = useState("");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const PER = 20;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<{ data: ActivityLog[] }>("/api/data/activity_logs").then((r) => alive && setLogs(r.data || [])).catch(() => undefined).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const actions = useMemo(() => [...new Set(logs.map((l) => l.action))].sort(), [logs]);
  const filtered = useMemo(() => logs.filter((l) => {
    if (term && ![l.description, l.actor_name, l.entity_type, l.entity_id].some((v) => (v || "").toLowerCase().includes(term.toLowerCase()))) return false;
    if (action && l.action !== action) return false;
    if (division && l.division_id !== division) return false;
    if (date && !String(l.created_at || "").startsWith(date)) return false;
    return true;
  }), [logs, term, action, division, date]);
  const pageRows = filtered.slice((page - 1) * PER, page * PER);

  return (
    <div>
      <PageHeader title="Riwayat Aktivitas" description="Audit trail seluruh perubahan data (tidak dapat diedit atau dihapus operator)" />
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <SearchBox value={q} onChange={setQ} placeholder="Cari pengguna, aktivitas, atau keterangan..." />
          <div className="flex flex-wrap gap-2">
            <select className="input !w-auto !py-1.5 text-xs" value={action} onChange={(e) => setAction(e.target.value)}><option value="">Semua aktivitas</option>{actions.map((a) => <option key={a} value={a}>{a}</option>)}</select>
            <select className="input !w-auto !py-1.5 text-xs" value={division} onChange={(e) => setDivision(e.target.value)}><option value="">Semua bagian</option>{divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            <input className="input !w-auto !py-1.5 text-xs" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {loading ? <Loading /> : filtered.length === 0 ? <EmptyState title="Tidak ada aktivitas" /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Waktu</th><th>Pengguna</th><th>Aktivitas</th><th>Keterangan</th><th>Jenis Data</th><th>Bagian</th></tr></thead>
              <tbody>
                {pageRows.map((l) => <tr key={l.id}>
                  <td className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(l.created_at)}</td>
                  <td className="font-medium">{l.actor_name}</td>
                  <td><Badge status={l.action}>{l.action}</Badge></td>
                  <td className="max-w-[400px] text-slate-600">{l.description}</td>
                  <td className="text-xs text-slate-500">{l.entity_type}</td>
                  <td className="text-xs text-slate-500">{divisions.find((d) => d.id === l.division_id)?.name || "-"}</td>
                </tr>)}
              </tbody>
            </table></div>
            <Pagination page={page} total={filtered.length} perPage={PER} onChange={setPage} />
          </>
        )}
      </div>
      {user?.role === "operator" && <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><Lock className="h-3.5 w-3.5" /> Operator hanya melihat aktivitasnya sendiri.</p>}
      {user?.role === "admin" && <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><History className="h-3.5 w-3.5" /> Data sebelum dan sesudah perubahan tersimpan pada detail log di database.</p>}
    </div>
  );
}
