"use client";

import { useEffect, useState } from "react";
import { Database, KeyRound, Save, Settings as SettingsIcon, ShieldCheck } from "lucide-react";
import { useApp } from "@/components/AppContext";
import { api, post } from "@/lib/client/api";
import { Field, PageHeader, confirmDialog, toast } from "@/components/ui";

export default function SettingsPage() {
  const { periods, activePeriodId, setActivePeriodId, refresh } = useApp();
  const [settings, setSettings] = useState<{ key: string; value: string }[]>([]);
  const [system, setSystem] = useState<{ mode: string; database: string; version: string } | null>(null);
  const [passwords, setPasswords] = useState({ current_password: "", password: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api<{ data: { key: string; value: string }[] }>("/api/data/settings").then((r) => setSettings(r.data || [])).catch(() => undefined);
    void api<{ mode: string; database: string; version: string }>("/api/system").then(setSystem).catch(() => undefined);
  }, []);

  const value = (key: string) => settings.find((s) => s.key === key)?.value || "";

  async function saveSetting(key: string, keyValue: string) {
    try { await post("/api/settings", { key, value: keyValue }); toast("Pengaturan disimpan"); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try { await post("/api/action", { action: "change_password", payload: passwords }); toast("Password diperbarui"); setPasswords({ current_password: "", password: "" }); }
    catch (err) { toast((err as Error).message, "error"); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader title="Pengaturan" description="Konfigurasi aplikasi, akun, dan informasi sistem" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2"><SettingsIcon className="h-5 w-5 text-navy-700" /><h2 className="font-bold text-navy-900">Pengaturan Aplikasi</h2></div>
          <div className="space-y-4">
            <Field label="Nama aplikasi"><input className="input" value={value("app_name")} onChange={(e) => setSettings((s) => s.map((x) => x.key === "app_name" ? { ...x, value: e.target.value } : x))} /></Field>
            <Field label="Nama organisasi"><input className="input" value={value("organization")} onChange={(e) => setSettings((s) => s.map((x) => x.key === "organization" ? { ...x, value: e.target.value } : x))} /></Field>
            <Field label="Periode aktif"><select className="input" value={activePeriodId} onChange={(e) => setActivePeriodId(e.target.value)}>{periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <button className="btn-primary" onClick={() => void Promise.all([saveSetting("app_name", value("app_name")), saveSetting("organization", value("organization"))])}><Save className="h-4 w-4" /> Simpan pengaturan</button>
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2"><KeyRound className="h-5 w-5 text-navy-700" /><h2 className="font-bold text-navy-900">Keamanan Akun</h2></div>
          <form className="space-y-4" onSubmit={(e) => void changePassword(e)}>
            <Field label="Password saat ini"><input className="input" type="password" value={passwords.current_password} onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })} required /></Field>
            <Field label="Password baru (min. 6 karakter)"><input className="input" type="password" minLength={6} value={passwords.password} onChange={(e) => setPasswords({ ...passwords, password: e.target.value })} required /></Field>
            <button className="btn-primary" disabled={saving}>{saving ? "Menyimpan..." : "Ubah password"}</button>
          </form>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2"><Database className="h-5 w-5 text-navy-700" /><h2 className="font-bold text-navy-900">Informasi Sistem</h2></div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Versi aplikasi</dt><dd className="font-semibold">{system?.version || "-"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Mode penyimpanan</dt><dd className="font-semibold">{system?.mode || "-"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Database</dt><dd className="font-semibold">{system?.database || "-"}</dd></div>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">Jika mode penyimpanan lokal, data disimpan pada berkas <code>.data/db.json</code>. Untuk produksi, konfigurasikan variabel Supabase dan jalankan migrasi database.</p>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-navy-700" /><h2 className="font-bold text-navy-900">Kontrol Data</h2></div>
          <div className="space-y-3">
            <a className="btn-secondary w-full" href="/api/export?type=full&format=json">Unduh cadangan penuh (JSON)</a>
            <button className="btn-secondary w-full" onClick={() => window.location.href = "/import-export"}>Kelola backup &amp; pemulihan</button>
            {system?.mode === "lokal" && (
              <button className="btn-secondary w-full" onClick={async () => {
                if (!(await confirmDialog("Muat data awal spreadsheet?", "Hanya data yang belum ada yang akan ditambahkan.", "Muat data"))) return;
                try { const r = await post<{ data: { imported: number } }>("/api/action", { action: "initial_import", payload: {} }); toast(`${r.data.imported} entri ditambahkan`); await refresh(); } catch (e) { toast((e as Error).message, "error"); }
              }}>Muat data awal spreadsheet</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
