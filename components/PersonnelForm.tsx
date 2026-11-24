"use client";

import { useEffect, useState } from "react";
import { api, post, patch } from "@/lib/client/api";
import { Field, Modal, confirmDialog, toast } from "@/components/ui";
import type { Division, MasterData, Personnel } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  initial?: Personnel | null;
  defaultDivisionId?: string;
  defaultPeriodId?: string;
  onSaved?: (person: Personnel) => void;
};

const empty = {
  full_name: "", gender: "", birth_place: "", birth_date: "", origin: "", korwil: "",
  phone: "", address: "", notes: "", status: "aktif", division_id: "", period_id: "", position_name: "Anggota",
};

export function PersonnelForm({ open, onClose, initial, defaultDivisionId = "", defaultPeriodId = "", onSaved }: Props) {
  const [form, setForm] = useState<Record<string, any>>({ ...empty });
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [master, setMaster] = useState<MasterData[]>([]);
  const [saving, setSaving] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [nameError, setNameError] = useState(false);

  useEffect(() => {
    void api<{ data: MasterData[] }>("/api/data/master_data").then((r) => setMaster(r.data || [])).catch(() => undefined);
    void api<{ data: Division[] }>("/api/data/divisions").then((r) => setDivisions(r.data || [])).catch(() => undefined);
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

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const options = (type: string, fallback: string[] = []) => {
    const values = master.filter((m) => m.type === type && m.is_active).map((m) => m.value);
    return [...new Set([...values, ...fallback])];
  };

  async function save(force = false) {
    if (!form.full_name.trim()) { setNameError(true); toast("Nama wajib diisi", "error"); return; }
    setNameError(false);
    setSaving(true);
    try {
      const { division_id, period_id, position_name, ...personFields } = form;
      let saved: Personnel;
      const suffix = force ? "?force=1" : "";
      if (initial?.id) {
        saved = (await patch<{ data: Personnel }>(`/api/data/personnel/${initial.id}${suffix}`, personFields)).data;
      } else {
        saved = (await post<{ data: Personnel }>(`/api/data/personnel${suffix}`, personFields)).data;
        if (division_id) {
          await post("/api/action", { action: "assign_personnel", payload: { personnel_id: saved.id, division_id, period_id, position_name } });
        }
      }
      onSaved?.(saved);
      toast(initial ? "Data personil diperbarui" : "Personil berhasil ditambahkan");
      if (repeat && !initial) {
        setForm({ ...empty, division_id, period_id, position_name });
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
            {!initial && (
              <>
                <Field label="Bagian / divisi">
                  <select className="input" value={form.division_id} onChange={(e) => set("division_id", e.target.value)}>
                    <option value="">Belum ditempatkan</option>
                    {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
                <Field label="Jabatan">
                  <input className="input" list="opt-position" value={form.position_name} onChange={(e) => set("position_name", e.target.value)} />
                  <datalist id="opt-position">{options("jabatan", ["Anggota"]).map((v) => <option key={v} value={v} />)}</datalist>
                </Field>
              </>
            )}
            {initial && <p className="text-xs text-slate-500 sm:col-span-2">Perpindahan bagian dan jabatan diatur melalui riwayat penugasan di halaman detail personil.</p>}
            <Field label="Status personil">
              <select className="input" value={form.status} onChange={(e) => set("status", e.target.value)}>
                <option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option>
              </select>
            </Field>
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
