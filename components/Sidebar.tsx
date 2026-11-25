"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  Activity, BarChart3, Boxes, ChevronLeft, Database, Download, FileClock, LayoutDashboard,
  ListChecks, Menu, Search, Settings, ShieldCheck, Users, X, CalendarRange, Layers3,
} from "lucide-react";
import { useApp } from "@/components/AppContext";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/personnel", label: "Data Personil", icon: Users },
  { href: "/bidangs", label: "Bidang", icon: Layers3 },
  { href: "/divisions", label: "Divisi", icon: Boxes },
  { href: "/search", label: "Pencarian Global", icon: Search },
  { href: "/periods", label: "Periode / Acara", icon: CalendarRange, admin: true },
  { href: "/supervision", label: "Data Pengawasan", icon: ShieldCheck },
  { href: "/reports", label: "Rekapitulasi", icon: BarChart3 },
  { href: "/import-export", label: "Import & Export", icon: Download },
  { href: "/master", label: "Data Master", icon: Database, admin: true },
  { href: "/accounts", label: "Manajemen Akun", icon: ListChecks, admin: true },
  { href: "/activity", label: "Riwayat Aktivitas", icon: FileClock },
  { href: "/settings", label: "Pengaturan", icon: Settings, admin: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.dataset.sidebar = collapsed ? "mini" : "full";
  }, [collapsed]);

  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileOpen]);

  const nav = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {items.filter((i) => !i.admin || user?.role === "admin").map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            onClick={() => setMobileOpen(false)}
            className={clsx(
              "flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition lg:min-h-0",
              active ? "bg-navy-800 text-white shadow-sm" : "text-slate-300 hover:bg-white/10 hover:text-white",
              collapsed && "lg:justify-center lg:px-2",
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {(!collapsed || mobileOpen) && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <button
        className="fixed left-3 top-2.5 z-50 flex h-11 w-11 items-center justify-center rounded-lg bg-navy-900 text-white shadow-lg lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Buka menu"
        aria-expanded={mobileOpen}
      >
        <Menu className="h-5 w-5" />
      </button>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-navy-900/20 bg-navy-950 text-white transition-all duration-200",
          collapsed ? "w-[76px]" : "w-[248px]",
          mobileOpen ? "translate-x-0 w-[280px] max-w-[85vw]" : "-translate-x-full lg:translate-x-0",
        )}
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchX.current !== null && e.changedTouches[0].clientX - touchX.current < -60) setMobileOpen(false);
          touchX.current = null;
        }}
      >
        <div className={clsx("flex h-16 shrink-0 items-center border-b border-white/10 px-4", collapsed && !mobileOpen ? "justify-center" : "justify-between")}>
          {!collapsed || mobileOpen ? (
            <Link href="/dashboard" className="leading-tight" onClick={() => setMobileOpen(false)}>
              <span className="block text-sm font-bold tracking-wide">SISTEM PENDATAAN</span>
              <span className="block text-[11px] font-medium tracking-[0.2em] text-navy-300">PERSONIL</span>
            </Link>
          ) : (
            <span className="text-base font-black">SP</span>
          )}
          <button className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Tutup menu"><X className="h-5 w-5" /></button>
        </div>
        {nav}
        <div className="shrink-0 border-t border-white/10 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:pb-3">
          {(!collapsed || mobileOpen) && (
            <div className="mb-2 rounded-lg bg-white/5 px-3 py-2 text-xs">
              <p className="truncate font-semibold text-white">{user?.fullName}</p>
              <p className="truncate capitalize text-navy-300">{user?.role} · @{user?.username}</p>
            </div>
          )}
          <button onClick={() => void logout()} className={clsx("flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-navy-200 hover:bg-white/10 lg:min-h-0 lg:text-xs", collapsed && !mobileOpen && "lg:justify-center")}>
            <Activity className="h-4 w-4" />
            {(!collapsed || mobileOpen) && "Keluar"}
          </button>
        </div>
      </aside>
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="absolute bottom-4 z-40 hidden rounded-full border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm transition lg:block"
        style={{ left: collapsed ? 64 : 236 }}
        aria-label={collapsed ? "Perbesar sidebar" : "Perkecil sidebar"}
      >
        <ChevronLeft className={clsx("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
      </button>
    </>
  );
}
