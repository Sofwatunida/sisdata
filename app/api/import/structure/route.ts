import { NextRequest } from "next/server";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getSession } from "@/lib/server/auth";
import { find } from "@/lib/server/db";
import { apiError, fail } from "@/lib/server/http";
import { replaceOrganizationStructure } from "@/lib/server/organization-import";
import type { Period } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_PDF_BYTES = 15 * 1024 * 1024;

let cachedPython: { command: string; prefix: string[] } | null = null;

function resolvePython() {
  if (cachedPython) return cachedPython;
  const localAppData = process.env.LOCALAPPDATA || "";
  const candidates = [
    process.env.PYTHON_BIN,
    "python",
    "python3",
    "py",
    "C:\\Python314\\python.exe",
    "C:\\Python313\\python.exe",
    "C:\\Python312\\python.exe",
    "C:\\Python311\\python.exe",
    localAppData && path.join(localAppData, "Programs", "Python", "Python314", "python.exe"),
    localAppData && path.join(localAppData, "Programs", "Python", "Python313", "python.exe"),
    localAppData && path.join(localAppData, "Programs", "Python", "Python312", "python.exe"),
  ].filter(Boolean) as string[];

  for (const command of candidates) {
    const prefix = path.basename(command).toLowerCase() === "py.exe" || command.toLowerCase() === "py" ? ["-3"] : [];
    const probe = spawnSync(command, [...prefix, "-c", "import pymupdf"], { stdio: "ignore", windowsHide: true });
    if (!probe.error && probe.status === 0) {
      cachedPython = { command, prefix };
      return cachedPython;
    }
  }
  throw new Error("Python + pymupdf tidak ditemukan. Install Python 3, jalankan `pip install pymupdf`, atau set PYTHON_BIN di .env.local");
}

function runExtractor(pdfPath: string, jsonPath: string, periodName: string, periodYear: string, sourceFile: string) {
  return new Promise<{ fields: number; divisions: number }>((resolve, reject) => {
    const script = path.join(process.cwd(), "scripts", "extract_pdf_structure.py");
    const python = resolvePython();
    const child = spawn(python.command, [...python.prefix, script, pdfPath, jsonPath, periodName, periodYear, sourceFile]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Gagal membaca PDF: ${stderr.trim() || stdout.trim() || `exit ${code}`}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim().split("\n").pop() || "{}"));
      } catch {
        reject(new Error("Hasil ekstraksi PDF tidak valid"));
      }
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) throw new Error("UNAUTHORIZED");
    if (session.role !== "admin") throw new Error("FORBIDDEN");

    const form = await req.formData();
    const file = form.get("file");
    const periodId = String(form.get("period_id") || "");
    if (!(file instanceof File)) return fail("Pilih file PDF terlebih dahulu");
    if (!file.name.toLowerCase().endsWith(".pdf")) return fail("File harus berformat .pdf");
    if (file.size > MAX_PDF_BYTES) return fail("Ukuran PDF maksimal 15 MB");
    if (!periodId) return fail("Pilih periode tujuan");
    const period = await find<Period>("periods", periodId);
    if (!period) return fail("Periode tujuan tidak ditemukan");

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "organization-pdf-"));
    const pdfPath = path.join(tempDir, "source.pdf");
    const jsonPath = path.join(tempDir, "structure.json");
    try {
      await fs.writeFile(pdfPath, Buffer.from(await file.arrayBuffer()));
      const extracted = await runExtractor(pdfPath, jsonPath, String(period.name || ""), String(period.year || ""), file.name);
      const structure = JSON.parse(await fs.readFile(jsonPath, "utf8"));
      if (!structure.fields?.length) return fail("Tidak ada bidang yang dikenali dari PDF");

      const uploadDir = path.join(process.cwd(), "data", "uploads");
      await fs.mkdir(uploadDir, { recursive: true });
      const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
      const storedPath = path.join(uploadDir, safeName);
      await fs.copyFile(pdfPath, storedPath);

      const result = await replaceOrganizationStructure(structure, periodId, session);
      return Response.json({
        data: {
          ...result,
          extracted,
          uploaded_file: path.relative(process.cwd(), storedPath).replace(/\\/g, "/"),
        },
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    return apiError(error);
  }
}
