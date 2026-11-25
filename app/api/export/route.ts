import { NextRequest } from "next/server";
import XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { all, snapshot } from "@/lib/server/db";
import { can, getSession } from "@/lib/server/auth";
import { apiError, fail } from "@/lib/server/http";
import { divisionStats, formatDate } from "@/lib/utils";
import type { Assignment, Bidang, Division, Personnel, Supervisor, WorkAssignment } from "@/lib/types";

export const dynamic = "force-dynamic";

function xlsxResponse(book: XLSX.WorkBook, fileName: string) {
  const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}

function pdfResponse(title: string, subtitle: string, columns: string[], rows: (string | number)[][]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.text(`${subtitle} | Dicetak: ${formatDate(new Date().toISOString())}`, 14, 22);
  autoTable(doc, { head: [columns], body: rows, startY: 27, styles: { fontSize: 7 }, headStyles: { fillColor: [37, 64, 104] }, alternateRowStyles: { fillColor: [246, 248, 251] } });
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Halaman ${i} dari ${pages}`, doc.internal.pageSize.getWidth() - 30, doc.internal.pageSize.getHeight() - 8);
  }
  const array = doc.output("arraybuffer");
  return new Response(new Uint8Array(array), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${title.replace(/[^\w]+/g, "-")}.pdf"` },
  });
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) throw new Error("UNAUTHORIZED");
    if (!(await can(session, "export"))) throw new Error("FORBIDDEN");
    const q = req.nextUrl.searchParams;
    const type = q.get("type") || "personnel";
    const format = q.get("format") || "xlsx";
    const periodId = q.get("period_id") || "";
    const divisionId = q.get("division_id") || "";
    const korwil = q.get("korwil") || "";
    const position = q.get("position") || "";
    const status = q.get("status") || "";

    const [personnel, bidangs, divisions, assignments, supervisors, works] = await Promise.all([
      all<Personnel>("personnel"), all<Bidang>("bidangs"), all<Division>("divisions"), all<Assignment>("assignments"),
      all<Supervisor>("supervisors"), all<WorkAssignment>("work_assignments"),
    ]);
    const bidangMap = new Map(bidangs.map((b) => [b.id, b.name]));

    if (type === "full" && format === "json") {
      const snap = await snapshot();
      return new Response(JSON.stringify({ exported_at: new Date().toISOString(), data: snap }, null, 2), {
        headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="backup-database.json"' },
      });
    }

    let columns: string[] = [];
    let rows: (string | number)[][] = [];
    let title = "LAPORAN PENDATAAN PERSONIL";
    let subtitle = "";

    if (type === "personnel") {
      const scopedAssignments = assignments.filter((a) => (!periodId || a.period_id === periodId) && (!divisionId || a.division_id === divisionId));
      const divisionMap = new Map(divisions.map((d) => [d.id, d]));
      const personIds = new Set(scopedAssignments.map((a) => a.personnel_id));
      const list = personnel.filter((p) =>
        personIds.has(p.id) &&
        (!korwil || (p.korwil || p.origin || "").toLowerCase().includes(korwil.toLowerCase())) &&
        (!status || p.status === status) &&
        (!position || scopedAssignments.some((a) => a.personnel_id === p.id && a.position_name.toLowerCase().includes(position.toLowerCase()))),
      );
      columns = ["No", "ID", "Nama", "Jenis Kelamin", "Asal/Korwil", "No. WhatsApp", "Bidang", "Bagian", "Jabatan", "Status", "Keterangan"];
      rows = list.map((p, i) => {
        const a = scopedAssignments.find((x) => x.personnel_id === p.id && x.status === "aktif") || scopedAssignments.find((x) => x.personnel_id === p.id);
        const d = a ? divisionMap.get(a.division_id) : null;
        return [i + 1, p.code, p.full_name, p.gender || "", p.korwil || p.origin || "", p.phone || "", d?.bidang_id ? bidangMap.get(d.bidang_id) || "" : "", d?.name || "", a?.position_name || "", p.status, p.notes || ""];
      });
      subtitle = `Data Personil${divisionId ? ` - ${divisionMap.get(divisionId)?.name || ""}` : ""}${korwil ? ` - Korwil ${korwil}` : ""}${position ? ` - ${position}` : ""}`;
    } else if (type === "divisions" || type === "rekap" || type === "needs") {
      const stats = divisionStats(divisions, assignments, periodId || undefined);
      columns = ["No", "Kode", "Bidang", "Nama Bagian", "Penanggung Jawab", "No. WhatsApp Ketua", "Koordinator", "Kebutuhan", "Terdaftar", "Aktif", "Kurang", "Lebih", "Keterangan"];
      rows = stats.map((s, i) => [i + 1, s.division.code, s.division.bidang_id ? bidangMap.get(s.division.bidang_id) || "" : "", s.division.name, s.division.leader_name || "", s.division.leader_phone || "", s.division.coordinator_name || "", s.required, s.registered, s.active, s.lacking, s.excess, s.division.notes || ""]);
      title = type === "needs" ? "LAPORAN KEBUTUHAN & KEKURANGAN PERSONIL" : "REKAPITULASI DIVISI";
      subtitle = "Rekapitulasi seluruh bagian dan kebutuhan personil";
    } else if (type === "supervision") {
      const supMap = new Map(supervisors.map((s) => [s.id, s]));
      columns = ["No", "Kelompok Pengawas", "Penanggung Jawab", "Nama Pekerjaan", "Keterangan", "Status", "Sheet Sumber"];
      rows = works.filter((w) => !periodId || w.period_id === periodId).map((w, i) => [i + 1, supMap.get(w.supervisor_id)?.group_name || "", supMap.get(w.supervisor_id)?.name || "", w.name, w.notes || "", w.status, w.source_sheet || ""]);
      title = "LAPORAN DATA PENGAWASAN PANITIA";
      subtitle = "Daftar pekerjaan pengawas panitia";
    } else {
      return fail("Jenis laporan tidak dikenal");
    }

    if (format === "xlsx") {
      const book = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet([[title], ["Dicetak", new Date().toLocaleString("id-ID")], [subtitle], [], columns, ...rows]);
      sheet["!cols"] = columns.map((c) => ({ wch: Math.max(12, Math.min(36, c.length + 6)) }));
      XLSX.utils.book_append_sheet(book, sheet, "Laporan");
      return xlsxResponse(book, `${type}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    }
    if (format === "pdf") return pdfResponse(title, subtitle, columns, rows);
    return fail("Format export tidak didukung");
  } catch (error) {
    return apiError(error);
  }
}
