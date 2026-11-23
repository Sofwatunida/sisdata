"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, ShieldCheck, User } from "lucide-react";
import { api } from "@/lib/client/api";
import { toast } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ user: unknown }>("/api/auth/me").then((r) => { if (r.user) router.replace("/dashboard"); }).catch(() => undefined);
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl md:grid-cols-2">
        <div className="hidden flex-col justify-between bg-navy-900 p-10 text-white md:flex">
          <div>
            <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold leading-snug">SISTEM PENDATAAN PERSONIL</h1>
            <p className="mt-3 text-sm leading-relaxed text-navy-200">
              Pendataan personil, penempatan bagian/divisi, penanggung jawab, kebutuhan tenaga kerja, dan rekapitulasi dalam satu sistem terpusat.
            </p>
          </div>
          <div className="space-y-3 text-xs text-navy-300">
            <p>Mendukung banyak periode/acara &amp; hak akses admin/operator.</p>
            <p>Data awal: KHIDMAH MILAD 2024.xlsx</p>
          </div>
        </div>
        <div className="p-8 sm:p-10">
          <h2 className="text-xl font-bold text-navy-900">Masuk ke akun Anda</h2>
          <p className="mt-1 text-sm text-slate-500">Gunakan akun yang telah diberikan administrator.</p>
          <form onSubmit={submit} className="mt-7 space-y-4">
            <label className="block">
              <span className="label">Username</span>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="input !pl-9" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" autoComplete="username" required />
              </div>
            </label>
            <label className="block">
              <span className="label">Password</span>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="input !pl-9 !pr-10" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setShow((v) => !v)} aria-label="Tampilkan password">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
            <button className="btn-primary w-full" disabled={loading}>{loading ? "Memeriksa..." : "Masuk"}</button>
          </form>
          <div className="mt-6 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
            <strong>Akun awal (mode lokal):</strong> admin / W^%HNK9JJmZ@TK5KW15yr2Ia 
          </div>
        </div>
      </div>
    </div>
  );
}
