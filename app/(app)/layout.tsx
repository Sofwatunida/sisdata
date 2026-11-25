"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, ChevronDown, Search } from "lucide-react";
import Link from "next/link";
import { AppProvider, useApp } from "@/components/AppContext";
import { Sidebar } from "@/components/Sidebar";
import { Loading } from "@/components/ui";

function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading, periods, activePeriodId, setActivePeriodId } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) return <Loading label="Menyiapkan aplikasi..." />;

  const period = periods.find((p) => p.id === activePeriodId);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <div className="app-main min-h-screen transition-[margin] duration-200">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:gap-3 sm:px-6 lg:pl-20">
          <div className="flex min-w-0 items-center gap-3 pl-12 lg:pl-0">
            <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 sm:gap-2 sm:px-3 sm:py-1.5">
              <CalendarRange className="hidden h-4 w-4 shrink-0 text-navy-700 sm:block" />
              <select
                className="w-full min-h-[44px] min-w-0 max-w-[130px] cursor-pointer truncate bg-transparent text-sm font-medium text-slate-700 outline-none sm:min-h-0 sm:max-w-[190px]"
                value={activePeriodId}
                onChange={(e) => setActivePeriodId(e.target.value)}
                aria-label="Pilih periode aktif"
              >
                {periods.length === 0 && <option value="">Belum ada periode</option>}
                {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
            </div>
            <span className="hidden text-sm font-semibold text-navy-900 md:inline lg:hidden">Pendataan Personil</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/search" className="btn-secondary h-11 w-11 !p-0 sm:h-auto sm:w-auto sm:!px-2.5 sm:!py-1.5" aria-label="Cari data">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Cari data</span>
            </Link>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 text-xs font-bold text-white">
              {user.fullName.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1500px] px-4 py-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:px-8">
          {period && <p className="mb-4 text-xs text-slate-400">Periode aktif: <span className="font-semibold text-slate-600">{period.name}</span>{period.status !== "aktif" && ` · ${period.status}`}</p>}
          {children}
        </main>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppProvider><Shell>{children}</Shell></AppProvider>;
}
