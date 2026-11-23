"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, type ApiUser } from "@/lib/client/api";
import type { Division, Period } from "@/lib/types";

type Ctx = {
  user: ApiUser | null;
  periods: Period[];
  divisions: Division[];
  activePeriodId: string;
  setActivePeriodId: (id: string) => void;
  loading: boolean;
  can: (action: string) => boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AppContext = createContext<Ctx>(null as unknown as Ctx);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [activePeriodId, setActivePeriodState] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api<{ user: ApiUser | null }>("/api/auth/me");
      setUser(me.user);
      if (!me.user) return;
      const [pRes, dRes, settings] = await Promise.all([
        api<{ data: Period[] }>("/api/data/periods"),
        api<{ data: Division[] }>("/api/data/divisions"),
        api<{ data: { key: string; value: string }[] }>("/api/data/settings?key=active_period_id").catch(() => ({ data: [] })),
      ]);
      setPeriods(pRes.data || []);
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

  const can = useCallback((action: string) => {
    if (!user) return false;
    if (user.role === "admin") return true;
    const key = `can_${action}` as keyof NonNullable<ApiUser["permissions"]>[number];
    return (user.permissions || []).some((perm) => Boolean(perm[key]));
  }, [user]);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/login";
  }, []);

  const value = useMemo(() => ({ user, periods, divisions, activePeriodId, setActivePeriodId, loading, can, refresh, logout }), [user, periods, divisions, activePeriodId, setActivePeriodId, loading, can, refresh, logout]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
