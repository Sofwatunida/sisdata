"use client";

import { useEffect, useMemo, useState } from "react";
import { api, post, patch } from "@/lib/client/api";
import { Field, Modal, confirmDialog, toast } from "@/components/ui";
import { useApp } from "@/components/AppContext";
import type { Assignment, Division, MasterData, Personnel } from "@/lib/types";
import { divisionNameKey, normalizeDivisionName } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  initial?: Personnel | null;
  defaultDivisionId?: string;
  defaultPeriodId?: string;
  onSaved?: (person: Personnel) => void;
  onDivisionsChanged?: () => Promise<void> | void;
};

const empty = {
  full_name: "", gender: "", birth_place: "", birth_date: "", origin: "", korwil: "",
  phone: "", address: "", notes: "", status: "aktif", division_id: "", period_id: "", position_name: "Anggota",
};

export function PersonnelForm({ open, onClose, initial, defaultDivisionId = "", defaultPeriodId = "", onSaved, onDivisionsChanged }: Props) {
  const { user } = useApp();
  const canCreateDivision = user?.role === "admin";
  const canSelectPosition = user?.role === "admin";
  const [form, setForm] = useState<Record<string, any>>({ ...empty });
  const [allDivisions, setAllDivisions] = useState<Division[]>([]);
  const [master, setMaster] = useState<MasterData[]>([]);
  const [currentAssignment, setCurrentAssignment] = useState<Assignment | null>(null);
  const [originalDivisionId, setOriginalDivisionId] = useState("");
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [divisionError, setDivisionError] = useState("");
  const [creatingDivision, setCreatingDivision] = useState(false);
  const [saving, setSaving] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [nameError, setNameError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomOpen(false);
    setCustomName("");
    setDivisionError("");
    void api<{ data: MasterData[] }>("/api/data/master_data").then((r) => setMaster(r.data || [])).catch(() => undefined);
    void api<{ data: Division[] }>("/api/data/divisions").then((r) => setAllDivisions(r.data || [])).catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (open) {
      setForm({
        ...empty,
        ...(initial || {}),
        division_id: defaultDivisionId || (initial as unknown as Record<string, string>)?.division_id || "",
        period_id: defaultPeriodId || "",
      });
    }
  }, [open, initial, defaultDivisionId, defaultPeriodId]);

  useEffect(() => {
    if (!open || !initial?.id) {
      setCurrentAssignment(null);
      setOriginalDivisionId("");
      setAssignmentLoading(false);
      return;
    }
    let cancelled = false;
    setAssignmentLoading(true);
    void api<{ data: Assignment[] }>("/api/data/assignments")
      .then((r) => {
        if (cancelled) return;
        const rows = r.data || [];
        const active = rows.filter((a) => a.personnel_id === initial.id && a.status === "aktif");
        const match = active.find((a) => a.period_id === defaultPeriodId) || active[0] || rows.find((a) => a.personnel_id === initial.id) || null;
        const divisionId = match?.division_id || (initial as unknown as Record<string, string>).division_id || "";
        setCurrentAssignment(match);
        setOriginalDivisionId(divisionId);
        setForm((f) => ({ ...f, division_id: divisionId, period_id: match?.period_id || f.period_id || defaultPeriodId }));
      })
      .catch(() => {
        if (cancelled) return;
        const divisionId = (initial as unknown as Record<string, string>).division_id || "";
        setOriginalDivisionId(divisionId);
        setForm((f) => ({ ...f, division_id: divisionId }));
      })
      .finally(() => { if (!cancelled) setAssignmentLoading(false); });
    return () => { cancelled = true; };
  }, [open, initial, defaultPeriodId]);

  const effectivePeriodId = currentAssignment?.period_id || defaultPeriodId || String(form.period_id || "");
  const divisions = useMemo(() => {
    if (!effectivePeriodId) return allDivisions;
    return allDivisions.filter((d) => d.period_id === effectivePeriodId || d.id === originalDivisionId || d.id === form.division_id);
  }, [allDivisions, effectivePeriodId, originalDivisionId, form.division_id]);

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const positionValue = () => canSelectPosition ? String(form.position_name || "Anggota") : "Anggota";
  const options = (type: string, fallback: string[] = []) => {
    const values = master.filter((m) => m.type === type && m.is_active).map((m) => m.value);
    return [...new Set([...values, ...fallback])];
  };

  async function addDivision() {
    const name = normalizeDivisionName(customName);
    if (!name) {
      setDivisionError("Nama bagian wajib diisi.");
      toast("Nama bagian wajib diisi", "error");
      return;
    }
    if (!effectivePeriodId) {
      setDivisionError("Periode penugasan belum tersedia.");
      toast("Periode penugasan belum tersedia", "error");
      return;
    }
    if (divisions.some((d) => divisionNameKey(d.name) === divisionNameKey(name))) {
      setDivisionError(`Bagian "${name}" sudah terdaftar.`);
      toast(`Bagian "${name}" sudah terdaftar`, "error");
      return;
    }
    setCreatingDivision(true);
    try {
      const created = (await post<{ data: Division }>("/api/data/divisions", {
        period_id: effectivePeriodId,
        name,
        required_count: 0,
        sort_order: divisions.length + 1,
        is_active: true,
      })).data;
      setAllDivisions((prev) => [...prev, created]);
      set("division_id", created.id);
      setCustomOpen(false);
      setCustomName("");
      setDivisionError("");
      await onDivisionsChanged?.();
      toast("Bagian ditambahkan");
    } catch (error) {
      const message = (error as Error).message;
      setDivisionError(message);
      toast(message, "error");
    } finally {
      setCreatingDivision(false);
    }
  }

  async function syncDivision(personnelId: string) {
    const targetDivisionId = String(form.division_id || "");
    if (currentAssignment?.division_id === targetDivisionId) return;
    if (!targetDivisionId) {
      if (currentAssignment) {
        await post("/api/action", { action: "end_assignment", payload: { assignment_id: currentAssignment.id } });
      }
      return;
    }
    if (!effectivePeriodId) throw new Error("Periode penugasan belum tersedia");
    if (currentAssignment) {
      await post("/api/action", {
        action: "move_personnel",
        payload: {
          assignment_id: currentAssignment.id,
          division_id: targetDivisionId,
          period_id: effectivePeriodId,
          position_name: positionValue(),
        },
      });
      return;
    }
    await post("/api/action", {
      action: "assign_personnel",
      payload: {
        personnel_id: personnelId,
        division_id: targetDivisionId,
        period_id: effectivePeriodId,
        position_name: positionValue(),
      },
    });
  }

  async function save(force = false) {
    if (!form.full_name.trim()) { setNameError(true); toast("Nama wajib diisi", "error"); return; }
    setNameError(false);
    setSaving(true);
    try {
      const { division_id, period_id, position_name: _positionName, ...personFields } = form;
      let saved: Personnel;
      const suffix = force ? "?force=1" : "";
      if (initial?.id) {
        saved = (await patch<{ data: Personnel }>(`/api/data/personnel/${initial.id}${suffix}`, personFields)).data;
        await syncDivision(saved.id);
      } else {
        saved = (await post<{ data: Personnel }>(`/api/data/personnel${suffix}`, personFields)).data;
        if (division_id) {
          await post("/api/action", {
            action: "assign_personnel",
            payload: { personnel_id: saved.id, division_id, period_id: period_id || effectivePeriodId, position_name: positionValue() },
          });
        }
      }
      onSaved?.(saved);
      toast(initial ? "Data personil diperbarui" : "Personil berhasil ditambahkan");
      if (repeat && !initial) {
        setForm({ ...empty, division_id, period_id, position_name: positionValue() });
      } else onClose();
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes("DUPLICATE_WARNING")) {
        const agree = await confirmDialog("Kemungkinan data duplikat", message.replace("DUPLICATE_WARNING: ", "") + "\n\nData tetap akan disimpan sebagai entri terpisah. Lanjutkan?", "Simpan tetap");
        if (agree) await save(true);
      } else toast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  const sectionTitle = "mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-navy-700";
  const sectionGrid = "grid gap-4 sm:grid-cols-2 xl:grid-cols-3";

  return (
    <Modal
      open={open} onClose={onClose} title={initial ? `Edit Personil · ${initial.code}` : "Tambah Personil"} size="xl"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {!initial ? (
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-slate-600 sm:min-h-0">
              <input type="checkbox" className="h-5 w-5 rounded border-slate-300 sm:h-4 sm:w-4" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
              Aktifkan input berulang
            </label>
          ) : <span />}
          <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
            <button className="btn-secondary" onClick={onClose}>Batal</button>
            <button className="btn-primary" onClick={() => void save()} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        <section>
          <h3 className={sectionTitle}><span className="flex h-5 w-5 items-center justify-center rounded-full bg-navy-100 text-[11px]">1</span> Identitas</h3>
          <div className={sectionGrid}>
            <Field label="ID Personil"><input className="input" value={initial?.code || "Otomatis"} disabled /></Field>
            <Field label="Nama lengkap *">
              <input
                className={nameError ? "input !border-rose-400 !ring-2 !ring-rose-100" : "input"}
                value={form.full_name}
                onChange={(e) => { set("full_name", e.target.value); if (e.target.value.trim()) setNameError(false); }}
                placeholder="Nama sesuai data"
                autoComplete="name"
                aria-invalid={nameError}
                required
              />
              {nameError && <span className="mt-1 block text-xs font-medium text-rose-600">Nama wajib diisi.</span>}
            </Field>
            <Field label="Jenis kelamin">
              <select className="input" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="">Pilih...</option><option value="L">Laki-laki</option><option value="P">Perempuan</option>
              </select>
            </Field>
            <Field label="Tempat lahir"><input className="input" value={form.birth_place} onChange={(e) => set("birth_place", e.target.value)} /></Field>
            <Field label="Tanggal lahir"><input className="input" type="date" value={form.birth_date} onChange={(e) => set("birth_date", e.target.value)} /></Field>
            <Field label="Asal daerah">
              <input className="input" list="opt-origin" value={form.origin} onChange={(e) => set("origin", e.target.value)} />
              <datalist id="opt-origin">{options("asal_daerah").map((v) => <option key={v} value={v} />)}</datalist>
            </Field>
            <Field label="Korwil / Koordinator Wilayah">
              <input className="input" list="opt-korwil" value={form.korwil} onChange={(e) => set("korwil", e.target.value)} />
              <datalist id="opt-korwil">{options("korwil").map((v) => <option key={v} value={v} />)}</datalist>
            </Field>
          </div>
        </section>

        <section>
          <h3 className={sectionTitle}><span className="flex h-5 w-5 items-center justify-center rounded-full bg-navy-100 text-[11px]">2</span> Informasi Kontak</h3>
          <div className={sectionGrid}>
            <Field label="Nomor WhatsApp / telepon">
              <input className="input" type="tel" inputMode="numeric" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="08xxxxxxxxxx" />
            </Field>
            <Field label="Alamat"><input className="input" value={form.address} onChange={(e) => set("address", e.target.value)} autoComplete="street-address" /></Field>
          </div>
        </section>

        <section>
          <h3 className={sectionTitle}><span className="flex h-5 w-5 items-center justify-center rounded-full bg-navy-100 text-[11px]">3</span> Informasi Penugasan</h3>
          <div className={sectionGrid}>
            <Field label="Divisi">
              <select
                className="input"
                value={form.division_id}
                disabled={assignmentLoading}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setCustomOpen(true);
                    setDivisionError("");
                    set("division_id", "");
                  } else {
                    setCustomOpen(false);
                    setDivisionError("");
                    set("division_id", e.target.value);
                  }
                }}
              >
                <option value="">Belum ditempatkan</option>
                {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                {canCreateDivision && <option value="__new__">+ Tambah bagian baru...</option>}
              </select>
              {assignmentLoading && <span className="mt-1 block text-[11px] text-slate-400">Memuat bagian saat ini...</span>}
            </Field>
            {!initial && (
              <Field label="Status">
                <select className="input" value={form.position_name === "Pengurus" ? "Pengurus" : "Anggota"} onChange={(e) => set("position_name", e.target.value)}>
                  <option value="Anggota">Anggota</option>
                  <option value="Pengurus">Pengurus</option>
                </select>
              </Field>
            )}
            {canCreateDivision && customOpen && (
              <div className="sm:col-span-2 rounded-lg border border-navy-100 bg-navy-50/50 p-3">
                <span className="label">Nama bagian baru</span>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    className="input flex-1"
                    value={customName}
                    onChange={(e) => { setCustomName(e.target.value); setDivisionError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addDivision(); } }}
                    placeholder="Contoh: Susuguh Umum"
                  />
                  <button className="btn-primary shrink-0" onClick={() => void addDivision()} disabled={creatingDivision}>
                    {creatingDivision ? "Menambah..." : "Tambah & pilih"}
                  </button>
                </div>
                {divisionError && <span className="mt-1 block text-xs font-medium text-rose-600">{divisionError}</span>}
              </div>
            )}
            <Field label="Status personil">
              <select className="input" value={form.status} onChange={(e) => set("status", e.target.value)}>
                <option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option>
              </select>
            </Field>
            {initial && <p className="text-xs text-slate-500 sm:col-span-2">Bagian saat ini otomatis terpilih. Memilih bagian lain akan memperbarui penugasan aktif setelah data disimpan.</p>}
          </div>
        </section>

        <section>
          <h3 className={sectionTitle}><span className="flex h-5 w-5 items-center justify-center rounded-full bg-navy-100 text-[11px]">4</span> Keterangan Tambahan</h3>
          <Field label="Keterangan"><textarea className="input min-h-[88px]" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Catatan tambahan" /></Field>
        </section>
      </div>
    </Modal>
  );
}
