import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { promisify } from "util";
import { AppError } from "@/lib/app-error";
import { ConfigurationError } from "@/lib/runtime-config";

const run = promisify(execFile);

// Word -> PDF. Serverless hosting (Vercel) cannot run Word or LibreOffice itself, so the portal
// calls a converter you configure:
//   PDF_CONVERTER_URL   a Gotenberg server (free, self-hosted)   e.g. https://pdf.example.com
//   CLOUDCONVERT_API_KEY a CloudConvert account (hosted, pay-per-use)
//   PDF_CONVERTER=local use LibreOffice installed on the same machine (own server / development)
export function pdfConfigured() {
  return Boolean(process.env.PDF_CONVERTER_URL || process.env.CLOUDCONVERT_API_KEY || process.env.PDF_CONVERTER === "local");
}

async function viaGotenberg(docx: Buffer, name: string) {
  const form = new FormData();
  form.append("files", new Blob([new Uint8Array(docx)]), name);
  const headers: Record<string, string> = {};
  if (process.env.PDF_CONVERTER_AUTH) headers.Authorization = process.env.PDF_CONVERTER_AUTH;
  const response = await fetch(`${process.env.PDF_CONVERTER_URL!.replace(/\/+$/, "")}/forms/libreoffice/convert`, { method: "POST", body: form, headers });
  if (!response.ok) throw new Error(`Gotenberg returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return Buffer.from(await response.arrayBuffer());
}

async function viaLocal(docx: Buffer, name: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "letter-"));
  try {
    const input = path.join(dir, name);
    await writeFile(input, docx);
    await run(process.env.SOFFICE_PATH || "soffice", ["--headless", "--norestore", `-env:UserInstallation=file://${dir}/profile`, "--convert-to", "pdf", "--outdir", dir, input], { timeout: 60_000 });
    return await readFile(path.join(dir, name.replace(/\.docx$/i, ".pdf")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function viaCloudConvert(docx: Buffer, name: string) {
  const key = process.env.CLOUDCONVERT_API_KEY!;
  const auth = { Authorization: `Bearer ${key}` };
  const created = await fetch("https://api.cloudconvert.com/v2/jobs", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ tasks: { upload: { operation: "import/upload" }, convert: { operation: "convert", input: "upload", input_format: "docx", output_format: "pdf" }, export: { operation: "export/url", input: "convert" } } }),
  });
  if (!created.ok) throw new Error(`CloudConvert returned ${created.status}: ${(await created.text()).slice(0, 200)}`);
  const job = (await created.json()) as { data: { id: string; tasks: { name: string; result?: { form?: { url: string; parameters: Record<string, string> } } }[] } };
  const form = job.data.tasks.find((task) => task.name === "upload")?.result?.form;
  if (!form) throw new Error("CloudConvert did not return an upload address");
  const body = new FormData();
  for (const [k, v] of Object.entries(form.parameters)) body.append(k, v);
  body.append("file", new Blob([new Uint8Array(docx)]), name);
  const uploaded = await fetch(form.url, { method: "POST", body });
  if (!uploaded.ok) throw new Error(`CloudConvert upload failed (${uploaded.status})`);
  const done = await fetch(`https://sync.api.cloudconvert.com/v2/jobs/${job.data.id}`, { headers: auth });
  const result = (await done.json()) as { data: { status: string; tasks: { name: string; status: string; message?: string; result?: { files?: { url: string }[] } }[] } };
  const exportTask = result.data.tasks.find((task) => task.name === "export");
  const url = exportTask?.result?.files?.[0]?.url;
  if (result.data.status !== "finished" || !url) throw new Error(`CloudConvert did not finish: ${result.data.tasks.find((t) => t.status === "error")?.message ?? result.data.status}`);
  const pdf = await fetch(url);
  if (!pdf.ok) throw new Error(`CloudConvert download failed (${pdf.status})`);
  return Buffer.from(await pdf.arrayBuffer());
}

export async function docxToPdf(docx: Buffer, name = "letter.docx") {
  if (!pdfConfigured()) {
    throw new ConfigurationError(
      "PDF_NOT_CONFIGURED",
      "PDF conversion is not configured. Set PDF_CONVERTER_URL (Gotenberg), CLOUDCONVERT_API_KEY, or PDF_CONVERTER=local.",
      "PDF conversion is not set up yet. Download the Word file instead, or ask the main administrator to connect a PDF converter.",
    );
  }
  try {
    if (process.env.PDF_CONVERTER_URL) return await viaGotenberg(docx, name);
    if (process.env.CLOUDCONVERT_API_KEY) return await viaCloudConvert(docx, name);
    return await viaLocal(docx, name);
  } catch (error) {
    console.error("PDF conversion failed", error);
    throw new AppError("The letter could not be converted to PDF right now. Nothing was sent. Try again in a moment, or download the Word file.", { status: 502, code: "PDF_CONVERSION_FAILED" });
  }
}
