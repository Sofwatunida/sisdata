import { NextResponse } from "next/server";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Terjadi kesalahan pada server";
  if (message === "UNAUTHORIZED") return fail("Silakan login terlebih dahulu", 401);
  if (message === "FORBIDDEN") return fail("Anda tidak memiliki hak akses untuk tindakan ini", 403);
  return fail(message, 400);
}
