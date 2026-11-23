"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Clock, GitMerge, MapPin, Pencil, Phone, Plus, UserRound } from "lucide-react";
import { api, post } from "@/lib/client/api";
import { Badge, EmptyState, Field, Loading, Modal, PageHeader, confirmDialog, toast } from "@/components/ui";
import { PersonnelForm } from "@/components/PersonnelForm";
import { formatDate } from "@/lib/utils";
import type { Assignment, Division, Period, Personnel } from "@/lib/types";

export default function PersonnelDetailPage() {
  const params = useParams<{ id: string }>();
  const [person, setPerson] = useState<Personnel | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [moveId, setMoveId] = useState("");
  const [form, setForm] = useState({ division_id: "", period_id: "", position_name: "Anggota", notes: "" });
  const [mergeOpen, setMergeOpen] = useState(false);
  const [duplicates, setDuplicates] = useState<Personnel[]>([]);
  const [mergeIds, setMergeIds] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const [p, a, d, per] = await Promise.all([
        api<{ data: Personnel }>(`/api/data/personnel/${params.id}`),
        api<{ data: Assignment[] }>("/api/data/assignments"),
        api<{ data: Division[] }>("/api/data/divisions"),
        api<{ data: Period[] }>("/api/data/periods"),
      ]);
      setPerson(p.data);
      setAssignments((a.data || []).filter((x) => x.personnel_id === params.id));
      setDivisions(d.data || []); setPeriods(per.data || []);
      setForm((f) => ({ ...f, period_id: per.data?.[0]?.id || "" }));
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [params.id]);

  async function addAssignment() {
    if (!form.division_id) { toast("Pilih bagian terlebih dahulu", "error"); return; }
    try {
      await post("/api/action", { action: "assign_personnel", payload: { personnel_id: params.id, ...form } });
      toast("Penugasan ditambahkan"); setAssignOpen(false); await load();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("DUPLICATE_WARNING") && await confirmDialog("Penugasan ganda", "Personil sudah memiliki penugasan aktif di bagian ini. Tetap tambahkan penugasan baru?", "Tetap tambahkan")) {
        await post("/api/action", { action: "assign_personnel", payload: { personnel_id: params.id, ...form, force: true } });
        toast("Penugasan ditambahkan"); setAssignOpen(false); await load();
      } else toast(msg, "error");
    }
  }

  async function move(assignmentId: string, target: string) {
    if (!target) return;
    if (!(await confirmDialog("Pindahkan penugasan ini?", "Penugasan lama akan ditutup dan penugasan baru dibuat."))) return;
    try { await post("/api/action", { action: "move_personnel", payload: { assignment_id: assignmentId, division_id: target } }); toast("Personil dipindahkan"); setMoveId(""); await load(); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  async function endAssignment(id: string) {
    if (!(await confirmDialog("Akhiri penugasan ini?"))) return;
    try { await post("/api/action", { action: "end_assignment", payload: { assignment_id: id } }); toast("Penugasan diakhiri"); await load(); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  async function openMerge() {
    try {
      const r = await api<{ data: { exact: { items: Personnel[] }[]; possible: { items: Personnel[] }[] } }>("/api/action", {
        method: "POST", body: JSON.stringify({ action: "check_duplicates" }),
      }).catch(() => ({ data: { exact: [], possible: [] } }));
      const all = [...(r.data.exact || []), ...(r.data.possible || [])].flatMap((g) => g.items).filter((p) => p.id !== params.id);
      setDuplicates(all); setMergeIds(new Set()); setMergeOpen(true);
    } catch (e) { toast((e as Error).message, "error"); }
  }

  if (loading) return <Loading />;
  if (!person) return <EmptyState title="Personil tidak ditemukan" />;

  const timeline = [...assignments].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const periodNames = [...new Set(assignments.map((a) => periods.find((p) => p.id === a.period_id)?.name).filter(Boolean))];

  return (
    <div>
      <Link href="/personnel" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy-800"><ArrowLeft className="h-4 w-4" /> Kembali ke data personil</Link>
      <PageHeader title={person.full_name} description={`${person.code} · ${person.korwil || person.origin || "Asal belum diisi"}`}
        actions={<><button className="btn-secondary" onClick={() => void openMerge()}><GitMerge className="h-4 w-4" /> Periksa duplikat</button><button className="btn-primary" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Edit data</button></>} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-1">
          <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-100 text-lg font-bold text-navy-800">{person.full_name.charAt(0)}</div>
            <div><p className="font-bold text-navy-900">{person.full_name}</p><p className="text-xs text-slate-500 font-mono">{person.code}</p></div>
          </div>
          <dl className="space-y-3 text-sm">
            {[
              ["Status", <Badge key="s" status={person.status} />],
              ["Jenis kelamin", person.gender === "L" ? "Laki-laki" : person.gender === "P" ? "Perempuan" : "-"],
              ["Tempat, tanggal lahir", [person.birth_place, person.birth_date ? formatDate(person.birth_date) : ""].filter(Boolean).join(", ") || "-"],
              ["Asal daerah", person.origin || "-"],
              ["Korwil", person.korwil || "-"],
              ["Alamat", person.address || "-"],
            ].map(([label, value]) => <div key={String(label)} className="flex justify-between gap-3"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium text-slate-800">{value}</dd></div>)}
          </dl>
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
            <p className="flex items-center gap-2 text-slate-600"><Phone className="h-4 w-4 text-navy-700" /> {person.phone || "Nomor belum diisi"}</p>
            <p className="flex items-center gap-2 text-slate-600"><MapPin className="h-4 w-4 text-navy-700" /> {periodNames.length ? periodNames.join(", ") : "Belum mengikuti periode"}</p>
          </div>
          {person.notes && <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><strong>Catatan:</strong> {person.notes}</div>}
          {person.source_sheet && <p className="mt-3 text-[11px] text-slate-400">Sumber: {person.source_file} · {person.source_sheet} · baris {person.source_row}</p>}
        </div>

        <div className="card overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-navy-700" /><h2 className="font-bold text-navy-900">Riwayat Penugasan</h2></div>
            <button className="btn-primary !py-1.5 !text-xs" onClick={() => setAssignOpen(true)}><Plus className="h-3.5 w-3.5" /> Tambah penugasan</button>
          </div>
          {timeline.length === 0 ? <EmptyState title="Belum ada penugasan" description="Tambahkan penugasan ke bagian/divisi tertentu." /> : (
            <div className="p-5">
              <ol className="relative border-l border-slate-200 pl-6">
                {timeline.map((a) => {
                  const div = divisions.find((d) => d.id === a.division_id);
                  const period = periods.find((p) => p.id === a.period_id);
                  return (
                    <li key={a.id} className="relative mb-6 last:mb-0">
                      <span className="absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-navy-700 ring-2 ring-navy-100" />
                      <div className="rounded-lg border border-slate-200 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-navy-900">{div?.name || "Bagian tidak ditemukan"}</p>
                            <p className="text-xs text-slate-500">{period?.name || "-"} · {a.position_name}</p>
                          </div>
                          <Badge status={a.status}>{a.status}</Badge>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">
                          Mulai {a.start_date ? formatDate(a.start_date) : "-"} · Selesai {a.end_date ? formatDate(a.end_date) : "-"}
                          {a.source_sheet && ` · Sumber ${a.source_sheet}:${a.source_row}`}
                        </p>
                        {a.notes && <p className="mt-1 text-xs text-slate-500">{a.notes}</p>}
                        {a.status === "aktif" && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <select className="input !w-auto !py-1 !text-xs" value={moveId === a.id ? form.division_id : ""} onChange={(e) => { setMoveId(a.id); setForm((f) => ({ ...f, division_id: e.target.value })); }}>
                              <option value="">Pindahkan ke...</option>{divisions.filter((d) => d.id !== a.division_id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                            {moveId === a.id && <button className="btn-secondary !py-1 !text-xs" onClick={() => void move(a.id, form.division_id)}>Simpan pindahan</button>}
                            <button className="text-xs font-medium text-rose-600 hover:underline" onClick={() => void endAssignment(a.id)}>Akhiri penugasan</button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>
      </div>

      <PersonnelForm open={editOpen} onClose={() => setEditOpen(false)} initial={person} onSaved={async () => { await load(); }} />

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Tambah Penugasan" size="sm">
        <div className="space-y-3">
          <Field label="Periode"><select className="input" value={form.period_id} onChange={(e) => setForm({ ...form, period_id: e.target.value })}>{periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Bagian / divisi"><select className="input" value={form.division_id} onChange={(e) => setForm({ ...form, division_id: e.target.value })}><option value="">Pilih bagian...</option>{divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          <Field label="Jabatan"><input className="input" value={form.position_name} onChange={(e) => setForm({ ...form, position_name: e.target.value })} /></Field>
          <Field label="Keterangan"><textarea className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 pt-2"><button className="btn-secondary" onClick={() => setAssignOpen(false)}>Batal</button><button className="btn-primary" onClick={() => void addAssignment()}>Simpan</button></div>
        </div>
      </Modal>

      <Modal open={mergeOpen} onClose={() => setMergeOpen(false)} title="Gabungkan Data Duplikat" size="lg">
        <p className="mb-3 text-sm text-slate-600">Pilih data yang akan digabung ke <strong>{person.full_name}</strong>. Seluruh riwayat penugasan akan tetap terjaga dan tercatat di riwayat aktivitas.</p>
        {duplicates.length === 0 ? <EmptyState title="Tidak ada kemungkinan duplikat" /> : (
          <div className="space-y-2">
            {duplicates.map((d) => (
              <label key={d.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={mergeIds.has(d.id)} onChange={() => setMergeIds((s) => { const n = new Set(s); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n; })} />
                <span className="font-mono text-xs text-slate-500">{d.code}</span><span className="font-semibold">{d.full_name}</span>
                <span className="ml-auto text-xs text-slate-500">{d.phone || "-"} · {d.korwil || d.origin || "-"}</span>
              </label>
            ))}
            <button className="btn-danger mt-3" disabled={!mergeIds.size} onClick={async () => {
              if (!(await confirmDialog(`Gabungkan ${mergeIds.size} data?`, "Proses tidak membatalkan riwayat penugasan.", "Gabungkan"))) return;
              try { await post("/api/action", { action: "merge_personnel", payload: { target_id: params.id, source_ids: [...mergeIds] } }); toast("Data duplikat digabungkan"); setMergeOpen(false); await load(); }
              catch (e) { toast((e as Error).message, "error"); }
            }}><UserRound className="h-4 w-4" /> Gabungkan {mergeIds.size || ""}</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
