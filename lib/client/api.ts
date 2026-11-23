"use client";

export type ApiUser = {
  userId: string;
  username: string;
  fullName: string;
  role: "admin" | "operator";
  permissions?: {
    can_view: boolean;
    can_create: boolean;
    can_edit: boolean;
    can_delete: boolean;
    can_move: boolean;
    can_manage_assignments: boolean;
    can_import: boolean;
    can_export: boolean;
    can_view_reports: boolean;
    division_id?: string;
    period_id?: string;
  }[];
};

export async function api<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: options?.body instanceof FormData ? options?.headers : { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const text = await res.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!res.ok) {
    const err = new Error((data as { error?: string })?.error || `Gagal menghubungi server (${res.status})`);
    (err as Error & { status?: number; data?: unknown }).status = res.status;
    (err as Error & { status?: number; data?: unknown }).data = data;
    throw err;
  }
  return data as T;
}

export const post = <T = unknown>(url: string, body: unknown) =>
  api<T>(url, { method: "POST", body: JSON.stringify(body) });
export const patch = <T = unknown>(url: string, body: unknown) =>
  api<T>(url, { method: "PATCH", body: JSON.stringify(body) });
export const del = <T = unknown>(url: string) => api<T>(url, { method: "DELETE" });
