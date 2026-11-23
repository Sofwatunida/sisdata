import { getSession } from "@/lib/server/auth";
import { supabaseEnabled } from "@/lib/server/db";
import { ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  const vercelNeedsSupabase = process.env.VERCEL === "1" && !supabaseEnabled;
  return ok({
    mode: vercelNeedsSupabase ? "belum dikonfigurasi" : supabaseEnabled ? "supabase" : "lokal",
    database: vercelNeedsSupabase ? "Supabase belum dikonfigurasi" : supabaseEnabled ? "Supabase PostgreSQL" : "Penyimpanan lokal (.data/db.json)",
    user: session ? { username: session.username, role: session.role } : null,
    version: "1.0.0",
  });
}
