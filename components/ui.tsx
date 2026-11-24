"use client";

import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import clsx from "clsx";
import { badgeClass } from "@/lib/utils";

export function toast(title: string, icon: "success" | "error" | "info" = "success") {
  const mobile = typeof window !== "undefined" && window.innerWidth < 640;
  Swal.fire({ toast: true, position: mobile ? "top" : "top-end", icon, title, showConfirmButton: false, timer: 3000, timerProgressBar: true, customClass: { popup: "!rounded-xl" } });
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
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-navy-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 [&>*]:grow sm:[&>*]:grow-0">{actions}</div>}
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
  return <span className={clsx("badge shrink-0", badgeClass(status || ""))}>{children || status}</span>;
}

export function StatCard({ label, value, icon, hint }: { label: string; value: string | number; icon?: React.ReactNode; hint?: string }) {
  return (
    <div className="card p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-bold text-navy-900 sm:mt-1.5 sm:text-2xl">{value}</p>
          {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
        </div>
        {icon && <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700 min-[400px]:flex">{icon}</div>}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = "lg" }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; size?: "sm" | "lg" | "xl" }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] sm:items-start sm:overflow-y-auto sm:p-8" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div
        className={clsx(
          "flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-card sm:my-auto sm:max-h-none sm:rounded-xl",
          size === "sm" ? "sm:max-w-md" : size === "xl" ? "sm:max-w-5xl" : "sm:max-w-3xl",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
          <h2 className="min-w-0 truncate font-bold text-navy-900">{title}</h2>
          <button onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 sm:h-8 sm:w-8" aria-label="Tutup">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:max-h-[calc(100vh-14rem)] sm:px-5 sm:py-5">{children}</div>
        {footer && <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5 sm:py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Pagination({ page, total, perPage, onChange }: { page: number; total: number; perPage: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  return (
    <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
      <span>Menampilkan {total ? (page - 1) * perPage + 1 : 0}–{Math.min(page * perPage, total)} dari {total}</span>
      <div className="flex items-center justify-between gap-1 sm:justify-start">
        <button className="btn-secondary h-11 w-11 !p-0 lg:h-8 lg:w-8" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Sebelumnya"><ChevronLeft className="h-5 w-5 lg:h-4 lg:w-4" /></button>
        <span className="px-2 text-sm">{page} / {pages}</span>
        <button className="btn-secondary h-11 w-11 !p-0 lg:h-8 lg:w-8" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Berikutnya"><ChevronRight className="h-5 w-5 lg:h-4 lg:w-4" /></button>
      </div>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = "Cari..." }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input className="input !pl-9 !pr-10" type="search" inputMode="search" enterKeyHint="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value && (
        <button type="button" className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-slate-400 hover:text-slate-600" onClick={() => onChange("")} aria-label="Bersihkan pencarian">
          <X className="h-4 w-4" />
        </button>
      )}
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
