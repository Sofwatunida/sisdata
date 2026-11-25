import { NextRequest } from "next/server";
import { all } from "@/lib/server/db";
import { getSession } from "@/lib/server/auth";
import { scopedBidangIds, scopedDivisionIds } from "@/lib/server/access";
import { apiError } from "@/lib/server/http";
import { coordinatorLabel, leaderLabel } from "@/lib/organization";
import type { Assignment, Bidang, BidangCoordinator, Division, Personnel, Period, SearchResult } from "@/lib/types";

export const dynamic = "force-dynamic";

const contains = (value: string, term: string) => String(value || "").toLowerCase().includes(term);
const digitTerm = (value: string) => String(value || "").replace(/\D/g, "");

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) throw new Error("UNAUTHORIZED");
    const params = req.nextUrl.searchParams;
    const raw = String(params.get("q") || "").trim();
    const term = raw.toLowerCase();
    const phoneTerm = digitTerm(raw);
    const periodId = String(params.get("period_id") || "");
    if (term.length < 2) return Response.json({ data: [], total: 0 });

    const [periods, bidangs, coordinators, divisions, personnel, assignments] = await Promise.all([
      all<Period>("periods"),
      all<Bidang>("bidangs"),
      all<BidangCoordinator>("bidang_coordinators"),
      all<Division>("divisions"),
      all<Personnel>("personnel"),
      all<Assignment>("assignments"),
    ]);
    const allowedBidangs = await scopedBidangIds(session, periodId || undefined);
    const allowedDivisions = await scopedDivisionIds(session, periodId || undefined);

    const scopedBidangs = bidangs.filter((b) => (!periodId || b.period_id === periodId) && (!allowedBidangs || allowedBidangs.includes(b.id)));
    const scopedDivisions = divisions.filter((d) => (!periodId || d.period_id === periodId) && (!allowedDivisions || allowedDivisions.includes(d.id)) && !d.is_archived);
    const scopedCoordinators = coordinators.filter((c) => scopedBidangs.some((b) => b.id === c.bidang_id));
    const scopedAssignments = assignments.filter((a) => scopedDivisions.some((d) => d.id === a.division_id) && (!periodId || a.period_id === periodId));

    const periodName = (id: string) => periods.find((p) => p.id === id)?.name || "";
    const bidangName = (id: string) => scopedBidangs.find((b) => b.id === id)?.name || "";
    const results: SearchResult[] = [];
    const push = (result: SearchResult) => {
      if (results.length < 300) results.push(result);
    };
    const matchText = (value: string) => contains(value, term);
    const matchPhone = (value: string) => phoneTerm.length >= 3 && digitTerm(value).includes(phoneTerm);

    for (const b of scopedBidangs) {
      if (matchText(b.name)) push({
        type: "bidang", label: b.name, detail: `Bidang · ${periodName(b.period_id)}`,
        period_id: b.period_id, bidang_id: b.id, division_id: "", personnel_id: "",
        period_name: periodName(b.period_id), bidang_name: b.name, division_name: "", href: `/bidangs/${b.id}`,
      });
    }
    for (const c of scopedCoordinators) {
      const b = scopedBidangs.find((x) => x.id === c.bidang_id);
      if (!b) continue;
      const name = coordinatorLabel(c, personnel);
      if (matchText(name) || matchPhone(c.phone || "")) push({
        type: "koordinator", label: name || c.phone || "-", detail: `Koordinator · ${b.name} · ${periodName(b.period_id)}`,
        period_id: b.period_id, bidang_id: b.id, division_id: "", personnel_id: c.personnel_id || "",
        period_name: periodName(b.period_id), bidang_name: b.name, division_name: "", href: `/bidangs/${b.id}`,
      });
    }
    for (const d of scopedDivisions) {
      const bName = bidangName(String(d.bidang_id || ""));
      if (matchText(d.name) || matchText(d.code)) push({
        type: "divisi", label: d.name, detail: `Divisi · ${bName || "Tanpa bidang"} · ${periodName(d.period_id)}`,
        period_id: d.period_id, bidang_id: String(d.bidang_id || ""), division_id: d.id, personnel_id: "",
        period_name: periodName(d.period_id), bidang_name: bName, division_name: d.name, href: `/divisions/${d.id}`,
      });
      const leader = leaderLabel(d, personnel);
      if (leader && (matchText(leader) || matchPhone(d.leader_phone || ""))) push({
        type: "ketua_divisi", label: leader, detail: `Ketua divisi · ${d.name} / ${bName || "Tanpa bidang"}`,
        period_id: d.period_id, bidang_id: String(d.bidang_id || ""), division_id: d.id, personnel_id: d.leader_personnel_id || "",
        period_name: periodName(d.period_id), bidang_name: bName, division_name: d.name, href: `/divisions/${d.id}`,
      });
    }
    for (const p of personnel) {
      const scoped = allowedDivisions ? scopedAssignments.some((a) => a.personnel_id === p.id) : true;
      if (!scoped || (!matchText(p.full_name) && !matchPhone(p.phone || ""))) continue;
      const assignment = scopedAssignments.find((a) => a.personnel_id === p.id && a.status === "aktif") || scopedAssignments.find((a) => a.personnel_id === p.id);
      const division = assignment ? scopedDivisions.find((d) => d.id === assignment.division_id) : null;
      const bName = division ? bidangName(String(division.bidang_id || "")) : "";
      push({
        type: "personil", label: p.full_name, detail: `Personil · ${division?.name || "Belum ditempatkan"}${bName ? ` / ${bName}` : ""}${assignment ? ` · ${periodName(assignment.period_id)}` : ""}`,
        period_id: assignment?.period_id || "", bidang_id: String(division?.bidang_id || ""), division_id: division?.id || "", personnel_id: p.id,
        period_name: assignment ? periodName(assignment.period_id) : "", bidang_name: bName, division_name: division?.name || "", href: `/personnel/${p.id}`,
      });
    }

    return Response.json({ data: results, total: results.length });
  } catch (error) {
    return apiError(error);
  }
}
