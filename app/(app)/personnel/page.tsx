"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye, Filter, Pencil, Plus, SlidersHorizontal, Trash2, Users, X } from "lucide-react";
import { useApp } from "@/components/AppContext";
import { api, del, patch, post } from "@/lib/client/api";
import { Badge, EmptyState, Loading, Modal, PageHeader, Pagination, SearchBox, confirmDialog, toast, useDebounce } from "@/components/ui";
import { PersonnelForm } from "@/components/PersonnelForm";
import { formatNumber } from "@/lib/utils";
import type { Assignment, Division, Personnel } from "@/lib/types";

const PER_PAGE = 15;

export default function PersonnelPage() {
  const { divisions, activePeriodId, refresh } = useApp();
  const [rows, setRows] = useState<Personnel[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q);
  const [division, setDivision] = useState("");
  const [origin, setOrigin] = useState("");
  const [status, setStatus] = useState("");
  const [position, setPosition] = useState("");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Personnel | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDivision, setMoveDivision] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, a] = await Promise.all([
        api<{ data: Personnel[] }>("/api/data/personnel"),
        api<{ data: Assignment[] }>(`/api/data/assignments?period_id=${activePeriodId}`),
      ]);
      setRows(p.data || []); setAssignments(a.data || []);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [activePeriodId]);

  const enriched = useMemo(() => rows.map((p) => {
    const a = assignments.find((x) => x.personnel_id === p.id && x.status === "aktif") || assignments.find((x) => x.personnel_id === p.id);
    return { ...p, division_id: a?.division_id || "", division_name: divisions.find((d) => d.id === a?.division_id)?.name || "Belum ditempatkan", position_name: a?.position_name || "-" };
  }), [rows, assignments, divisions]);

  const origins = useMemo(() => [...new Set(rows.map((p) => p.korwil || p.origin || "").filter(Boolean))].sort(), [rows]);
  const positions = useMemo(() => [...new Set(assignments.map((a) => a.position_name).filter(Boolean))].sort(), [assignments]);

  const filtered = useMemo(() => {
    const term = debouncedQ.toLowerCase().trim();
    let list = enriched.filter((p) => {
      if (term && ![p.full_name, p.code, p.origin, p.korwil, p.phone, p.position_name, p.division_name].some((v) => (v || "").toLowerCase().includes(term))) return false;
      if (division && p.division_id !== division) return false;
      if (origin && (p.korwil || p.origin) !== origin) return false;
      if (status && p.status !== status) return false;
      if (position && p.position_name !== position) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "id") return a.code.localeCompare(b.code);
      if (sort === "newest") return String(b.created_at || "").localeCompare(String(a.created_at || ""));
      return a.full_name.localeCompare(b.full_name);
    });
    return list;
  }, [enriched, debouncedQ, division, origin, status, position, sort]);

  useEffect(() => setPage(1), [debouncedQ, division, origin, status, position]);

  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allChecked = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const activeFilters: { key: string; label: string; clear: () => void }[] = [
    ...(division ? [{ key: "division", label: divisions.find((d) => d.id === division)?.name || "Bagian", clear: () => setDivision("") }] : []),
    ...(origin ? [{ key: "origin", label: origin, clear: () => setOrigin("") }] : []),
    ...(position ? [{ key: "position", label: position, clear: () => setPosition("") }] : []),
    ...(status ? [{ key: "status", label: status === "aktif" ? "Aktif" : "Nonaktif", clear: () => setStatus("") }] : []),
  ];
  const resetFilters = () => { setDivision(""); setOrigin(""); setStatus(""); setPosition(""); setQ(""); };

  async function removePerson(p: Personnel) {
    if (!(await confirmDialog(`Nonaktifkan ${p.full_name}?`, "Data tidak dihapus permanen dan tetap dapat dilihat pada riwayat.", "Nonaktifkan"))) return;
    try { await del(`/api/data/personnel/${p.id}`); toast("Personil dinonaktifkan"); await load(); await refresh(); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  async function bulkStatus(value: "aktif" | "nonaktif") {
    if (!(await confirmDialog(`Ubah status ${selected.size} personil menjadi ${value}?`))) return;
    try {
      await Promise.all([...selected].map((id) => patch(`/api/data/personnel/${id}`, { status: value })));
      toast(`${selected.size} personil diperbarui`); setSelected(new Set()); await load();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  async function bulkMove() {
    if (!moveDivision) { toast("Pilih bagian tujuan", "error"); return; }
    try {
      for (const id of selected) {
        const current = assignments.find((a) => a.personnel_id === id && a.status === "aktif");
        if (current?.division_id === moveDivision) continue;
        if (current) await post("/api/action", { action: "move_personnel", payload: { assignment_id: current.id, division_id: moveDivision } });
        else await post("/api/action", { action: "assign_personnel", payload: { personnel_id: id, division_id: moveDivision, period_id: activePeriodId, position_name: "Anggota" } });
      }
      toast(`${selected.size} personil dipindahkan`); setSelected(new Set()); setMoveOpen(false); await load(); await refresh();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  return (
    <div>
      <PageHeader title="Data Personil" description={`${formatNumber(rows.length)} personil terdaftar · ${formatNumber(filtered.length)} sesuai filter`}
        actions={<><button className="btn-secondary" onClick={() => window.location.href = `/api/export?type=personnel&format=xlsx&period_id=${activePeriodId}`}>Export XLSX</button><button className="btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> Tambah Personil</button></>} />

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SearchBox value={q} onChange={setQ} placeholder="Cari nama, ID, korwil, telepon..." />
            <button className="btn-secondary w-full lg:hidden" onClick={() => setFilterOpen(true)}>
              <SlidersHorizontal className="h-4 w-4" /> Filter &amp; Urutkan
              {activeFilters.length > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-navy-800 px-1.5 text-[11px] font-bold text-white">{activeFilters.length}</span>}
            </button>
            <div className="hidden flex-wrap items-center gap-2 lg:flex">
              <select className="input !w-auto !py-1.5 text-xs" value={division} onChange={(e) => setDivision(e.target.value)}>
                <option value="">Semua bagian</option>{divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select className="input !w-auto !py-1.5 text-xs" value={origin} onChange={(e) => setOrigin(e.target.value)}>
                <option value="">Semua asal</option>{origins.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select className="input !w-auto !py-1.5 text-xs" value={position} onChange={(e) => setPosition(e.target.value)}>
                <option value="">Semua jabatan</option>{positions.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select className="input !w-auto !py-1.5 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Semua status</option><option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option>
              </select>
              <select className="input !w-auto !py-1.5 text-xs" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="name">Urut: Nama</option><option value="id">Urut: ID</option><option value="newest">Urut: Terbaru</option>
              </select>
              {(division || origin || status || position || q) && <button className="btn-secondary !px-2 !py-1.5" onClick={resetFilters} aria-label="Reset filter"><X className="h-4 w-4" /></button>}
            </div>
          </div>
          {activeFilters.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 lg:hidden">
              {activeFilters.map((f) => (
                <button key={f.key} className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full bg-navy-50 px-3 py-1 text-xs font-semibold text-navy-800 ring-1 ring-inset ring-navy-200" onClick={f.clear}>
                  {f.label} <X className="h-3.5 w-3.5" />
                </button>
              ))}
              <button className="min-h-[32px] px-2 text-xs font-medium text-slate-500 underline" onClick={resetFilters}>Reset filter</button>
            </div>
          )}
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-navy-100 bg-navy-50 px-4 py-2.5 text-sm">
            <Filter className="h-4 w-4 text-navy-700" />
            <span className="font-semibold text-navy-900">{selected.size} dipilih</span>
            <button className="btn-secondary !py-1 !text-xs" onClick={() => void bulkStatus("aktif")}>Aktifkan</button>
            <button className="btn-secondary !py-1 !text-xs" onClick={() => void bulkStatus("nonaktif")}>Nonaktifkan</button>
            <button className="btn-secondary !py-1 !text-xs" onClick={() => setMoveOpen(true)}>Pindahkan</button>
            <button className="ml-auto min-h-[44px] text-xs text-slate-500 underline lg:min-h-0" onClick={() => setSelected(new Set())}>Batalkan pilihan</button>
          </div>
        )}

        {loading ? <Loading /> : filtered.length === 0 ? <EmptyState title="Tidak ada personil yang cocok" description="Ubah kata kunci atau filter untuk melihat data lain." /> : (
          <>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-2 text-xs font-medium text-slate-500 lg:hidden">
              <input type="checkbox" className="h-5 w-5" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(pageRows.map((r) => r.id)))} />
              Pilih semua di halaman ini
            </label>
            <ul className="divide-y divide-slate-100 lg:hidden">
              {pageRows.map((p) => (
                <li key={p.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <label className="-m-3 shrink-0 cursor-pointer p-3">
                      <input type="checkbox" className="block h-5 w-5" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Pilih ${p.full_name}`} />
                    </label>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/personnel/${p.id}`} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center break-words font-semibold text-navy-800 lg:min-h-0">{p.full_name}</Link>
                        <Badge status={p.status} />
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">{p.code}</p>
                      <p className="mt-1.5 truncate text-sm text-slate-600">{p.division_name} · {p.position_name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{p.korwil || p.origin || "Asal belum diisi"}{p.phone ? ` · ${p.phone}` : ""}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Link href={`/personnel/${p.id}`} className="btn-secondary flex-1 !text-xs"><Eye className="h-4 w-4" /> Detail</Link>
                    <button className="icon-btn border border-slate-200" onClick={() => { setEditing(p); setFormOpen(true); }} aria-label={`Edit ${p.full_name}`}><Pencil className="h-4 w-4" /></button>
                    <button className="icon-btn border border-slate-200 !text-rose-600 hover:!bg-rose-50" onClick={() => void removePerson(p)} aria-label={`Nonaktifkan ${p.full_name}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="table-wrap hidden lg:block">
              <table className="table">
                <thead><tr>
                  <th className="w-10"><input type="checkbox" className="h-4 w-4" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(pageRows.map((r) => r.id)))} /></th>
                  <th>ID</th><th>Nama</th><th>Asal / Korwil</th><th>Kontak</th><th>Bagian</th><th>Jabatan</th><th>Status</th><th className="text-right">Aksi</th>
                </tr></thead>
                <tbody>
                  {pageRows.map((p) => (
                    <tr key={p.id}>
                      <td><input type="checkbox" className="h-4 w-4" checked={selected.has(p.id)} onChange={() => toggle(p.id)} /></td>
                      <td className="whitespace-nowrap font-mono text-xs text-slate-500">{p.code}</td>
                      <td><Link href={`/personnel/${p.id}`} className="font-semibold text-navy-800 hover:underline">{p.full_name}</Link></td>
                      <td className="text-slate-600">{p.korwil || p.origin || "-"}</td>
                      <td className="whitespace-nowrap text-slate-600">{p.phone || "-"}</td>
                      <td className="text-slate-600">{p.division_name}</td>
                      <td className="text-slate-600">{p.position_name}</td>
                      <td><Badge status={p.status} /></td>
                      <td className="whitespace-nowrap text-right">
                        <div className="flex justify-end gap-1">
                          <Link href={`/personnel/${p.id}`} className="icon-btn" title="Detail"><Eye className="h-4 w-4" /></Link>
                          <button className="icon-btn" onClick={() => { setEditing(p); setFormOpen(true); }} title="Edit"><Pencil className="h-4 w-4" /></button>
                          <button className="icon-btn !text-rose-600 hover:!bg-rose-50" onClick={() => void removePerson(p)} title="Nonaktifkan"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
          </>
        )}
      </div>

      <PersonnelForm open={formOpen} onClose={() => setFormOpen(false)} initial={editing} defaultDivisionId="" defaultPeriodId={activePeriodId} onSaved={async () => { await load(); await refresh(); }} />

      <Modal
        open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter & Urutkan" size="sm"
        footer={<div className="flex gap-2"><button className="btn-secondary flex-1" onClick={resetFilters}>Reset</button><button className="btn-primary flex-1" onClick={() => setFilterOpen(false)}>Terapkan</button></div>}
      >
        <div className="space-y-4">
          <label className="block"><span className="label">Bagian / divisi</span>
            <select className="input" value={division} onChange={(e) => setDivision(e.target.value)}>
              <option value="">Semua bagian</option>{divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Asal / korwil</span>
            <select className="input" value={origin} onChange={(e) => setOrigin(e.target.value)}>
              <option value="">Semua asal</option>{origins.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Jabatan</span>
            <select className="input" value={position} onChange={(e) => setPosition(e.target.value)}>
              <option value="">Semua jabatan</option>{positions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Status</span>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Semua status</option><option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option>
            </select>
          </label>
          <label className="block"><span className="label">Urutkan</span>
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="name">Nama (A–Z)</option><option value="id">ID personil</option><option value="newest">Terbaru</option>
            </select>
          </label>
          <p className="text-xs text-slate-500">{formatNumber(filtered.length)} personil sesuai filter.</p>
        </div>
      </Modal>

      <Modal open={moveOpen} onClose={() => setMoveOpen(false)} title={`Pindahkan ${selected.size} personil`} size="sm">
        <div className="space-y-4">
          <label className="block"><span className="label">Bagian tujuan</span>
            <select className="input" value={moveDivision} onChange={(e) => setMoveDivision(e.target.value)}>
              <option value="">Pilih bagian...</option>{divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <div className="flex gap-2 sm:justify-end"><button className="btn-secondary flex-1 sm:flex-none" onClick={() => setMoveOpen(false)}>Batal</button><button className="btn-primary flex-1 sm:flex-none" onClick={() => void bulkMove()}>Pindahkan</button></div>
        </div>
      </Modal>
      <p className="mt-3 text-xs text-slate-400"><Users className="mr-1 inline h-3 w-3" />Klik nama untuk melihat detail dan riwayat penugasan.</p>
    </div>
  );
}
