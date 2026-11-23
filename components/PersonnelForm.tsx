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
    if (!form.full_name.trim()) { toast("Nama wajib diisi", "error"); return; }
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

  return (
    <Modal open={open} onClose={onClose} title={initial ? `Edit Personil · ${initial.code}` : "Tambah Personil"} size="xl">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="ID Personil"><input className="input" value={initial?.code || "Otomatis"} disabled /></Field>
        <Field label="Nama lengkap *"><input className="input" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Nama sesuai data" /></Field>
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
        <Field label="Nomor WhatsApp / telepon"><input className="input" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="08xxxxxxxxxx" /></Field>
        <Field label="Alamat"><input className="input" value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
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
        <Field label="Status personil">
          <select className="input" value={form.status} onChange={(e) => set("status", e.target.value)}>
            <option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option>
          </select>
        </Field>
        <div className="md:col-span-2 xl:col-span-3">
          <Field label="Keterangan"><textarea className="input min-h-[72px]" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Catatan tambahan" /></Field>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        {!initial ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
            Aktifkan input berulang
          </label>
        ) : <span />}
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={() => void save()} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</button>
        </div>
      </div>
    </Modal>
  );
}
