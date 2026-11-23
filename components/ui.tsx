"use client";

import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import clsx from "clsx";
import { badgeClass } from "@/lib/utils";

export function toast(title: string, icon: "success" | "error" | "info" = "success") {
  Swal.fire({ toast: true, position: "top-end", icon, title, showConfirmButton: false, timer: 3000, timerProgressBar: true, customClass: { popup: "!rounded-xl" } });
}

export async function confirmDialog(title: string, text?: string, confirmText = "Ya, lanjutkan") {
  const result = await Swal.fire({
    title,
    text,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#254068",
    cancelButtonColor: "#94a3b8",
    confirmButtonText: confirmText,
    cancelButtonText: "Batal",
    customClass: { popup: "!rounded-xl" },
  });
  return result.isConfirmed;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-navy-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Loading({ label = "Memuat data..." }: { label?: string }) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-slate-500">
      <Loader2 className="h-6 w-6 animate-spin text-navy-600" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ title = "Belum ada data", description }: { title?: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Search className="h-5 w-5" />
      </div>
      <p className="font-semibold text-slate-700">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
    </div>
  );
}

export function Badge({ status, children }: { status?: string; children?: React.ReactNode }) {
  return <span className={clsx("badge", badgeClass(status || ""))}>{children || status}</span>;
}

export function StatCard({ label, value, icon, hint }: { label: string; value: string | number; icon?: React.ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-navy-900">{value}</p>
          {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
        </div>
        {icon && <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-50 text-navy-700">{icon}</div>}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, size = "lg" }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: "sm" | "lg" | "xl" }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-[2px] sm:p-8" onMouseDown={onClose}>
      <div
        className={clsx("card my-auto w-full overflow-hidden", size === "sm" ? "max-w-md" : size === "xl" ? "max-w-5xl" : "max-w-3xl")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-navy-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Tutup">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[calc(100vh-10rem)] overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

export function Pagination({ page, total, perPage, onChange }: { page: number; total: number; perPage: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  return (
    <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
      <span>Menampilkan {total ? (page - 1) * perPage + 1 : 0}–{Math.min(page * perPage, total)} dari {total}</span>
      <div className="flex items-center gap-1">
        <button className="btn-secondary !px-2 !py-1" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Sebelumnya"><ChevronLeft className="h-4 w-4" /></button>
        <span className="px-2">{page} / {pages}</span>
        <button className="btn-secondary !px-2 !py-1" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Berikutnya"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = "Cari..." }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input className="input !pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function useDebounce<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}
