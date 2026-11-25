import "server-only";
import { all } from "@/lib/server/db";
import type { Personnel } from "@/lib/types";

const cleanName = (value: string) => String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
const digits = (value: string) => String(value || "").replace(/\D/g, "");
const tokens = (value: string) => cleanName(value).split(" ").filter((t) => t.length > 2);

export async function findLinkedPersonnel(name: string, phone: string): Promise<string> {
  const targetName = cleanName(name);
  const targetPhone = digits(phone);
  if (!targetName && !targetPhone) return "";
  const rows = await all<Personnel>("personnel");
  const active = rows.filter((p) => p.status !== "nonaktif");

  if (targetName) {
    const byName = active.filter((p) => cleanName(p.full_name) === targetName);
    if (byName.length === 1) return byName[0].id;
    if (byName.length > 1 && targetPhone) {
      const exact = byName.filter((p) => digits(p.phone || "") === targetPhone);
      if (exact.length === 1) return exact[0].id;
    }
  }

  if (targetPhone && targetName) {
    const byPhone = active.filter((p) => digits(p.phone || "") === targetPhone);
    if (byPhone.length === 1) {
      const nameTokens = tokens(targetName);
      const personTokens = tokens(byPhone[0].full_name);
      if (nameTokens.some((t) => personTokens.includes(t))) return byPhone[0].id;
    }
  }

  return "";
}
