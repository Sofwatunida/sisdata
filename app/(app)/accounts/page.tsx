"use client";

import { useEffect, useState } from "react";
import { KeyRound, Mail, Pencil, Plus, ShieldCheck, UserCog } from "lucide-react";
import { useApp } from "@/components/AppContext";
import { api, patch, post } from "@/lib/client/api";
import { Badge, EmptyState, Field, Loading, Modal, PageHeader, confirmDialog, toast } from "@/components/ui";
import type { OperatorPermission, Profile } from "@/lib/types";

const PERMISSION_KEYS = [
  ["can_view", "Melihat data"], ["can_create", "Menambah data"], ["can_edit", "Mengedit data"],
  ["can_delete", "Menghapus data"], ["can_move", "Memindahkan personil"], ["can_manage_assignments", "Mengelola penugasan"],
  ["can_import", "Import Excel"], ["can_export", "Export data"], ["can_view_reports", "Melihat rekapitulasi"],
] as const;

export default function AccountsPage() {
  const { periods, divisions } = useApp();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [permissions, setPermissions] = useState<OperatorPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [permOpen, setPermOpen] = useState<Profile | null>(null);
  const [passOpen, setPassOpen] = useState<Profile | null>(null);
  const [newAccount, setNewAccount] = useState({ username: "", email: "", full_name: "", password: "", role: "operator" });
  const [scope, setScope] = useState<Record<string, unknown>>({ division_id: "", period_id: "" });
  const [passwords, setPasswords] = useState({ current_password: "", password: "" });

  const load = async () => {
    setLoading(true);
    try {
      const [p, a] = await Promise.all([
        api<{ data: Profile[] }>("/api/data/profiles"),
        api<{ data: OperatorPermission[] }>("/api/data/operator_permissions"),
      ]);
      setProfiles(p.data || []); setPermissions(a.data || []);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  async function createAccount() {
    try { await post("/api/action", { action: "create_account", payload: newAccount }); toast("Akun berhasil dibuat"); setCreateOpen(false); setNewAccount({ username: "", email: "", full_name: "", password: "", role: "operator" }); await load(); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  async function toggleActive(p: Profile) {
    try { await patch(`/api/data/profiles/${p.id}`, { is_active: !p.is_active }); toast(p.is_active ? "Akun dinonaktifkan" : "Akun diaktifkan"); await load(); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  async function savePermissions() {
    if (!permOpen) return;
    try {
      await post("/api/action", { action: "update_permissions", payload: { profile_id: permOpen.id, scopes: [scope] } });
      toast("Hak akses disimpan"); setPermOpen(null); await load();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  async function changePassword() {
    if (!passOpen) return;
    try { await post("/api/action", { action: "change_password", payload: { user_id: passOpen.id, ...passwords } }); toast("Password diperbarui"); setPassOpen(null); setPasswords({ current_password: "", password: "" }); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  return (
    <div>
      <PageHeader title="Manajemen Akun" description="Kelola akun admin dan operator beserta hak aksesnya"
        actions={<button className="btn-primary" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Buat Akun</button>} />
      {loading ? <Loading /> : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-slate-100 lg:hidden">
            {profiles.map((p) => {
              const perms = permissions.filter((x) => x.profile_id === p.id);
              const rename = async () => {
                const username = window.prompt("Username baru", p.username);
                if (!username || username === p.username) return;
                try { await patch(`/api/data/profiles/${p.id}`, { username, email: p.email }); toast("Username diperbarui"); await load(); } catch (e) { toast((e as Error).message, "error"); }
              };
              const remail = async () => {
                const email = window.prompt("Email baru (boleh gmail)", p.email || `${p.username}@pendataan.local`);
                if (!email || email === p.email) return;
                try { await patch(`/api/data/profiles/${p.id}`, { email }); toast("Email diperbarui"); await load(); } catch (e) { toast((e as Error).message, "error"); }
              };
              return (
                <li key={p.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-navy-900">{p.full_name}</p>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">@{p.username}</p>
                      {p.email && <p className="mt-0.5 truncate text-xs text-slate-500">{p.email}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge status={p.role}>{p.role}</Badge>
                      <Badge status={p.is_active ? "aktif" : "nonaktif"} />
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">{p.role === "admin" ? "Akses penuh" : perms.length ? `${perms.length} cakupan · ${perms.filter((x) => x.can_edit).length} dapat mengedit` : "Cakupan akses belum diatur"}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button className="icon-btn border border-slate-200" title="Ubah username" aria-label="Ubah username" onClick={() => void rename()}><Pencil className="h-4 w-4" /></button>
                    <button className="icon-btn border border-slate-200" title="Ubah email" aria-label="Ubah email" onClick={() => void remail()}><Mail className="h-4 w-4" /></button>
                    {p.role === "operator" && <button className="icon-btn border border-slate-200 !text-navy-700" title="Hak akses" aria-label="Hak akses" onClick={() => { setPermOpen(p); setScope({ division_id: perms[0]?.division_id || "", period_id: perms[0]?.period_id || "", ...(perms[0] || {}) }); }}><ShieldCheck className="h-4 w-4" /></button>}
                    <button className="icon-btn border border-slate-200" title="Ganti password" aria-label="Ganti password" onClick={() => setPassOpen(p)}><KeyRound className="h-4 w-4" /></button>
                    {p.username !== "admin" && <button className="btn-secondary ml-auto !py-1.5 !text-xs !text-rose-600" onClick={async () => { if (await confirmDialog(`${p.is_active ? "Nonaktifkan" : "Aktifkan"} akun ${p.username}?`)) await toggleActive(p); }}>{p.is_active ? "Nonaktifkan" : "Aktifkan"}</button>}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="table-wrap hidden lg:block"><table className="table">
            <thead><tr><th>Username</th><th>Email</th><th>Nama</th><th>Role</th><th>Status</th><th>Cakupan Akses</th><th className="text-right">Aksi</th></tr></thead>
            <tbody>
              {profiles.map((p) => {
                const perms = permissions.filter((x) => x.profile_id === p.id);
                return <tr key={p.id}>
                  <td className="font-mono text-xs text-slate-600">@{p.username}</td>
                  <td className="text-xs text-slate-500">{p.email || "-"}</td>
                  <td className="font-semibold">{p.full_name}</td>
                  <td><Badge status={p.role}>{p.role}</Badge></td>
                  <td><Badge status={p.is_active ? "aktif" : "nonaktif"} /></td>
                  <td className="text-xs text-slate-500">{p.role === "admin" ? "Akses penuh" : perms.length ? `${perms.length} cakupan · ${perms.filter((x) => x.can_edit).length} dapat mengedit` : "Belum diatur"}</td>
                  <td className="whitespace-nowrap text-right">
                    <button className="icon-btn" title="Ubah username" onClick={async () => {
                      const username = window.prompt("Username baru", p.username);
                      if (!username || username === p.username) return;
                      try { await patch(`/api/data/profiles/${p.id}`, { username, email: p.email }); toast("Username diperbarui"); await load(); } catch (e) { toast((e as Error).message, "error"); }
                    }}><Pencil className="h-4 w-4" /></button>
                    <button className="icon-btn" title="Ubah email" onClick={async () => {
                      const email = window.prompt("Email baru (boleh gmail)", p.email || `${p.username}@pendataan.local`);
                      if (!email || email === p.email) return;
                      try { await patch(`/api/data/profiles/${p.id}`, { email }); toast("Email diperbarui"); await load(); } catch (e) { toast((e as Error).message, "error"); }
                    }}><Mail className="h-4 w-4" /></button>
                    {p.role === "operator" && <button className="icon-btn !text-navy-700 hover:!bg-navy-50" title="Hak akses" onClick={() => { setPermOpen(p); setScope({ division_id: perms[0]?.division_id || "", period_id: perms[0]?.period_id || "", ...(perms[0] || {}) }); }}><ShieldCheck className="h-4 w-4" /></button>}
                    <button className="icon-btn" title="Ganti password" onClick={() => setPassOpen(p)}><KeyRound className="h-4 w-4" /></button>
                    {p.username !== "admin" && <button className="min-h-[44px] text-xs font-medium text-rose-600 hover:underline lg:min-h-0" onClick={async () => { if (await confirmDialog(`${p.is_active ? "Nonaktifkan" : "Aktifkan"} akun ${p.username}?`)) await toggleActive(p); }}>{p.is_active ? "Nonaktifkan" : "Aktifkan"}</button>}
                  </td>
                </tr>;
              })}
            </tbody>
          </table></div>
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Buat Akun Baru" size="sm">
        <div className="space-y-3">
          <Field label="Username *"><input className="input" value={newAccount.username} onChange={(e) => setNewAccount({ ...newAccount, username: e.target.value })} /></Field>
          <Field label="Email (kosongkan untuk otomatis)"><input className="input" type="email" value={newAccount.email} onChange={(e) => setNewAccount({ ...newAccount, email: e.target.value })} /></Field>
          <Field label="Nama lengkap"><input className="input" value={newAccount.full_name} onChange={(e) => setNewAccount({ ...newAccount, full_name: e.target.value })} /></Field>
          <Field label="Password * (min. 6 karakter)"><input className="input" type="password" value={newAccount.password} onChange={(e) => setNewAccount({ ...newAccount, password: e.target.value })} /></Field>
          <Field label="Role"><select className="input" value={newAccount.role} onChange={(e) => setNewAccount({ ...newAccount, role: e.target.value })}><option value="operator">Operator</option><option value="admin">Admin</option></select></Field>
          <div className="flex gap-2 pt-2 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none"><button className="btn-secondary" onClick={() => setCreateOpen(false)}>Batal</button><button className="btn-primary" onClick={() => void createAccount()}>Buat Akun</button></div>
        </div>
      </Modal>

      <Modal open={Boolean(permOpen)} onClose={() => setPermOpen(null)} title={`Hak Akses · ${permOpen?.username || ""}`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cakupan bagian"><select className="input" value={String(scope.division_id || "")} onChange={(e) => setScope({ ...scope, division_id: e.target.value })}><option value="">Seluruh bagian</option>{divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          <Field label="Cakupan periode"><select className="input" value={String(scope.period_id || "")} onChange={(e) => setScope({ ...scope, period_id: e.target.value })}><option value="">Semua periode</option>{periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        </div>
        <p className="mb-2 mt-4 text-sm font-semibold text-navy-900">Izin yang diberikan</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PERMISSION_KEYS.map(([key, label]) => <label key={key} className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"><input type="checkbox" className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" checked={Boolean(scope[key])} onChange={(e) => setScope({ ...scope, [key]: e.target.checked })} /> {label}</label>)}
        </div>
        <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none"><button className="btn-secondary" onClick={() => setPermOpen(null)}>Batal</button><button className="btn-primary" onClick={() => void savePermissions()}>Simpan Hak Akses</button></div>
      </Modal>

      <Modal open={Boolean(passOpen)} onClose={() => setPassOpen(null)} title={`Ganti Password · ${passOpen?.username || ""}`} size="sm">
        <div className="space-y-3">
          <Field label="Password lama"><input className="input" type="password" value={passwords.current_password} onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })} /></Field>
          <Field label="Password baru"><input className="input" type="password" value={passwords.password} onChange={(e) => setPasswords({ ...passwords, password: e.target.value })} /></Field>
          <div className="flex gap-2 pt-2 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none"><button className="btn-secondary" onClick={() => setPassOpen(null)}>Batal</button><button className="btn-primary" onClick={() => void changePassword()}>Simpan</button></div>
        </div>
      </Modal>
      {profiles.length === 0 && <EmptyState title="Belum ada akun" />}
      <p className="mt-3 text-xs text-slate-400"><UserCog className="mr-1 inline h-3 w-3" />Penghapusan akun tidak diperbolehkan; gunakan nonaktifkan untuk menjaga relasi data.</p>
    </div>
  );
}
