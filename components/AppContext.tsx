"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, type ApiUser } from "@/lib/client/api";
import type { Bidang, BidangCoordinator, Division, Period } from "@/lib/types";

type CanScope = { bidangId?: string; divisionId?: string; periodId?: string };

type Ctx = {
  user: ApiUser | null;
  periods: Period[];
  bidangs: Bidang[];
  coordinators: BidangCoordinator[];
  divisions: Division[];
  activePeriodId: string;
  setActivePeriodId: (id: string) => void;
  loading: boolean;
  can: (resourceOrAction: string, actionOrScope?: string | CanScope, scope?: CanScope) => boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AppContext = createContext<Ctx>(null as unknown as Ctx);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [bidangs, setBidangs] = useState<Bidang[]>([]);
  const [coordinators, setCoordinators] = useState<BidangCoordinator[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [activePeriodId, setActivePeriodState] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api<{ user: ApiUser | null }>("/api/auth/me");
      setUser(me.user);
      if (!me.user) return;
      const [pRes, bRes, cRes, dRes, settings] = await Promise.all([
        api<{ data: Period[] }>("/api/data/periods"),
        api<{ data: Bidang[] }>("/api/data/bidangs").catch(() => ({ data: [] })),
        api<{ data: BidangCoordinator[] }>("/api/data/bidang_coordinators").catch(() => ({ data: [] })),
        api<{ data: Division[] }>("/api/data/divisions"),
        api<{ data: { key: string; value: string }[] }>("/api/data/settings?key=active_period_id").catch(() => ({ data: [] })),
      ]);
      setPeriods(pRes.data || []);
      setBidangs(bRes.data || []);
      setCoordinators(cRes.data || []);
      setDivisions(dRes.data || []);
      const saved = settings.data?.[0]?.value || "";
      setActivePeriodState((prev) => prev || saved || pRes.data?.[0]?.id || "");
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const setActivePeriodId = useCallback((id: string) => {
    setActivePeriodState(id);
    void api("/api/settings", { method: "POST", body: JSON.stringify({ key: "active_period_id", value: id }) }).catch(() => undefined);
  }, []);

  const can = useCallback((resourceOrAction: string, actionOrScope?: string | CanScope, scope?: CanScope) => {
    if (!user) return false;
    if (user.role === "admin") return true;
    const resource = typeof actionOrScope === "string" ? resourceOrAction : "";
    const action = typeof actionOrScope === "string" ? actionOrScope : resourceOrAction;
    const target = typeof actionOrScope === "object" ? actionOrScope : scope;
    if (["periods", "profiles", "activity_logs", "backups", "settings"].includes(resource)) return false;
    const key = `can_${action}` as keyof NonNullable<ApiUser["permissions"]>[number];
    return (user.permissions || []).some((perm) => {
      if (!Boolean(perm[key])) return false;
      if (target?.bidangId) {
        if (perm.bidang_id) return perm.bidang_id === target.bidangId;
        if (perm.division_id) {
          const division = divisions.find((d) => d.id === perm.division_id);
          return Boolean(division && division.bidang_id === target.bidangId);
        }
      }
      if (target?.divisionId && perm.division_id && perm.division_id !== target.divisionId) return false;
      if (target?.divisionId && perm.bidang_id) {
        const division = divisions.find((d) => d.id === target.divisionId);
        if (!division || division.bidang_id !== perm.bidang_id) return false;
      }
      if (target?.periodId && perm.period_id && perm.period_id !== target.periodId) return false;
      return true;
    });
  }, [user, divisions]);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/login";
  }, []);

  const value = useMemo(() => ({ user, periods, bidangs, coordinators, divisions, activePeriodId, setActivePeriodId, loading, can, refresh, logout }), [user, periods, bidangs, coordinators, divisions, activePeriodId, setActivePeriodId, loading, can, refresh, logout]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
