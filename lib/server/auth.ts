import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { all, hashPassword, insert, patch, supabaseEnabled, uid, verifyPassword } from "@/lib/server/db";
import type { OperatorPermission, Profile, Session } from "@/lib/types";

const COOKIE = "spp_session";
const MAX_AGE = 60 * 60 * 12;

const b64 = (input: string) => Buffer.from(input).toString("base64url");
const sign = (payload: string) => {
  const secret = process.env.AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET wajib diatur di production");
  return crypto.createHmac("sha256", secret || "pendataan-personil-dev-secret-change-me").update(payload).digest("base64url");
};

export async function createSessionCookie(session: Session) {
  const payload = b64(JSON.stringify({ ...session, exp: Date.now() + MAX_AGE * 1000 }));
  const token = `${payload}.${sign(payload)}`;
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE);
}

async function readToken(): Promise<(Session & { exp: number }) | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  if (sign(payload) !== signature) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const data = await readToken();
  if (!data) return null;
  if (supabaseEnabled && data.accessToken) {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: authData, error } = await sb.auth.getUser(data.accessToken);
    if (error || !authData.user) return null;
    const profiles = await all<Profile>("profiles");
    const profile = profiles.find((p) => p.id === authData.user.id);
    if (!profile || !profile.is_active) return null;
    return { userId: profile.id, username: profile.username, fullName: profile.full_name, role: profile.role, accessToken: data.accessToken };
  }
  const profiles = await all<Profile>("profiles");
  const profile = profiles.find((p) => p.id === data.userId);
  if (!profile || !profile.is_active) return null;
  return { userId: profile.id, username: profile.username, fullName: profile.full_name, role: profile.role };
}

export async function authenticate(username: string, password: string): Promise<{ session: Session; error?: string }> {
  const user = username.trim().toLowerCase();
  if (!user || !password) return { session: null as unknown as Session, error: "Username dan password wajib diisi" };
  if (supabaseEnabled) {
    const profiles = await all<Profile>("profiles");
    const profile = profiles.find((p) => p.username.toLowerCase() === user);
    if (!profile || !profile.is_active) return { session: null as unknown as Session, error: "Username atau password salah" };
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await sb.auth.signInWithPassword({
      email: profile.email || `${profile.username}@pendataan.local`,
      password,
    });
    if (error || !data.session) return { session: null as unknown as Session, error: "Username atau password salah" };
    return {
      session: {
        userId: profile.id,
        username: profile.username,
        fullName: profile.full_name,
        role: profile.role,
        accessToken: data.session.access_token,
      },
    };
  }
  const profiles = await all<Profile>("profiles");
  const profile = profiles.find((p) => p.username.toLowerCase() === user);
  if (!profile || !profile.is_active || !profile.password_hash || !verifyPassword(password, profile.password_hash)) {
    return { session: null as unknown as Session, error: "Username atau password salah" };
  }
  return {
    session: { userId: profile.id, username: profile.username, fullName: profile.full_name, role: profile.role },
  };
}

export type Action =
  | "view" | "create" | "edit" | "delete" | "move" | "assign" | "import" | "export" | "reports";

export async function can(session: Session | null, action: Action, scope?: { divisionId?: string; periodId?: string }): Promise<boolean> {
  if (!session) return false;
  if (session.role === "admin") return true;
  const permissions = await all<OperatorPermission>("operator_permissions");
  const mine = permissions.filter((p) => p.profile_id === session.userId);
  const relevant = mine.filter((p) => {
    if (p.period_id && scope?.periodId && p.period_id !== scope.periodId) return false;
    if (p.division_id && scope?.divisionId && p.division_id !== scope.divisionId) return false;
    if (!scope?.divisionId && p.division_id) return false;
    if (!scope?.periodId && p.period_id) return false;
    return true;
  });
  const pool = relevant.length ? relevant : mine.filter((p) => !p.division_id && !p.period_id);
  if (!pool.length) return false;
  const key: Record<Action, keyof OperatorPermission> = {
    view: "can_view",
    create: "can_create",
    edit: "can_edit",
    delete: "can_delete",
    move: "can_move",
    assign: "can_manage_assignments",
    import: "can_import",
    export: "can_export",
    reports: "can_view_reports",
  };
  if (action === "view" && scope?.divisionId) {
    return pool.some((p) => p.can_view && (!p.division_id || p.division_id === scope.divisionId));
  }
  return pool.some((p) => Boolean(p[key[action]]));
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

export async function createProfile(input: { username: string; password: string; full_name: string; role: "admin" | "operator" }) {
  const username = input.username.trim().toLowerCase();
  const existing = await all<Profile>("profiles");
  if (existing.some((p) => p.username.toLowerCase() === username)) throw new Error("Username sudah digunakan");
  const id = uid();
  const profile: Profile = {
    id,
    username,
    email: supabaseEnabled ? `${username}@pendataan.local` : "",
    full_name: input.full_name.trim() || username,
    role: input.role,
    is_active: true,
    password_hash: supabaseEnabled ? undefined : hashPassword(input.password),
    created_at: new Date().toISOString(),
  };
  await insert("profiles", profile as unknown as Record<string, unknown>);
  if (supabaseEnabled) {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await sb.auth.admin.createUser({
      id,
      email: profile.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: profile.full_name, role: profile.role },
    });
    if (error) {
      await patch("profiles", id, { is_active: false });
      throw new Error(error.message);
    }
  }
  return profile;
}

export async function syncProfileAuth(id: string, input: { username?: string; full_name?: string }) {
  if (!supabaseEnabled) return;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const payload: { email?: string; user_metadata?: Record<string, string> } = {};
  if (input.username) payload.email = `${input.username.trim().toLowerCase()}@pendataan.local`;
  if (input.full_name) payload.user_metadata = { full_name: input.full_name.trim() };
  if (!Object.keys(payload).length) return;
  const { error } = await sb.auth.admin.updateUserById(id, payload);
  if (error) throw new Error(error.message);
}

export async function updateProfilePassword(id: string, password: string) {
  const profile = await all<Profile>("profiles").then((rows) => rows.find((p) => p.id === id));
  if (!profile) throw new Error("Akun tidak ditemukan");
  await patch("profiles", id, { password_hash: hashPassword(password) });
  if (supabaseEnabled) {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await sb.auth.admin.updateUserById(id, { password });
    if (error) throw new Error(error.message);
  }
}

export async function logActivity(input: {
  actor: Session;
  action: string;
  entity_type: string;
  entity_id?: string;
  period_id?: string;
  division_id?: string;
  before_data?: unknown;
  after_data?: unknown;
  description: string;
}) {
  await insert("activity_logs", {
    id: uid(),
    actor_id: input.actor.userId,
    actor_name: input.actor.fullName || input.actor.username,
    action: input.action,
    entity_type: input.entity_type,
    entity_id: input.entity_id || "",
    period_id: input.period_id || "",
    division_id: input.division_id || "",
    before_data: input.before_data ?? null,
    after_data: input.after_data ?? null,
    description: input.description,
    created_at: new Date().toISOString(),
  });
}
