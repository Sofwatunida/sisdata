"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Users } from "lucide-react";
import { useApp } from "@/components/AppContext";
import { api } from "@/lib/client/api";
import { EmptyState, Loading, PageHeader, SearchBox, useDebounce } from "@/components/ui";
import type { SearchResult } from "@/lib/types";

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  bidang: "Bidang", koordinator: "Koordinator", divisi: "Divisi",   ketua_divisi: "Ketua Divisi", personil: "Personil", telepon: "Nomor Telepon",
};

export default function SearchPage() {
  const { activePeriodId, periods } = useApp();
  const [q, setQ] = useState("");
  const [periodId, setPeriodId] = useState(activePeriodId);
  const [type, setType] = useState("semua");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const term = useDebounce(q);

  useEffect(() => setPeriodId(activePeriodId), [activePeriodId]);
  useEffect(() => {
    let alive = true;
    if (term.trim().length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    api<{ data: SearchResult[] }>(`/api/search?q=${encodeURIComponent(term)}&period_id=${periodId}`)
      .then((r) => alive && setResults(r.data || []))
      .catch(() => alive && setResults([]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [term, periodId]);

  const types = ["semua", ...Array.from(new Set(results.map((r) => r.type)))];
  const filtered = type === "semua" ? results : results.filter((r) => r.type === type);
  const period = periods.find((p) => p.id === periodId);

  return (
    <div>
      <PageHeader title="Pencarian Global" description={`Cari bidang, koordinator, divisi, ketua divisi, atau personil · ${period?.name || "-"}`} />
      <div className="card p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <SearchBox value={q} onChange={setQ} placeholder="Cari nama atau nomor WhatsApp (minimal 2 karakter)..." />
          <select className="input" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>{periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </div>
        {results.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{types.map((t) => <button key={t} onClick={() => setType(t)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${type === t ? "bg-navy-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{t === "semua" ? `Semua (${results.length})` : `${TYPE_LABEL[t as SearchResult["type"]] || t} (${results.filter((r) => r.type === t).length})`}</button>)}</div>}
      </div>

      <div className="mt-5">
        {loading ? <Loading /> : term.trim().length < 2 ? <EmptyState title="Mulai pencarian" description="Masukkan minimal 2 karakter nama atau 3 digit nomor telepon." /> : filtered.length === 0 ? <EmptyState title="Tidak ada hasil" description="Coba kata kunci lain atau ganti periode." /> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r, i) => (
              <Link key={`${r.type}-${r.href}-${r.label}-${i}`} href={r.href} className="card group flex items-start gap-3 p-4 transition hover:border-navy-300 hover:bg-navy-50/30">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700"><Users className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="block break-words font-semibold text-navy-900 group-hover:underline">{r.label}</span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-navy-700" />
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">{r.detail}</span>
                  {r.bidang_name && <span className="mt-1 block truncate text-[11px] text-navy-600">Bidang: {r.bidang_name}</span>}
                  {r.division_name && <span className="mt-0.5 block truncate text-[11px] text-slate-500">Divisi: {r.division_name}</span>}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
      {results.length > 0 && <p className="mt-3 text-xs text-slate-400">Menampilkan {filtered.length} dari {results.length} hasil (maksimal 300).</p>}
    </div>
  );
}
