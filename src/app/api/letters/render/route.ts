import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DOCUMENT_ROLES, requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { AppError, notFound } from "@/lib/app-error";
import { DOCX_MIME, PDF_MIME, renderTemplate } from "@/lib/letters";
import { docxToPdf } from "@/lib/pdf-convert";
import { cleanValues, fileBase, logLetter, renderBody } from "@/lib/letter-render";

export const dynamic = "force-dynamic";

// format "docx" with preview:true feeds the on-screen preview (not logged); a real download is logged.
export async function POST(req: NextRequest) {
  try {
    const session = requireRole(req, DOCUMENT_ROLES, "Only an Admin, CEO, COO or HR can generate letters.");
    const body = await renderBody(req);
    const template = await db.letterTemplate.findUnique({ where: { id: body.templateId } });
    if (!template || !template.active) throw notFound("The template");
    const values = cleanValues(body.values, template.fields);
    const docx = renderTemplate(Buffer.from(template.content), values);
    if (body.format === "pdf") {
      const pdf = await docxToPdf(docx);
      await logLetter({ template, session, action: "DOWNLOADED_PDF", values, employeeCode: body.employeeCode });
      return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": PDF_MIME, "Content-Disposition": `attachment; filename="${fileBase(template.letterType, values)}.pdf"`, "Cache-Control": "no-store" } });
    }
    if (body.format !== "docx") throw new AppError("Choose Word or PDF.", { status: 400, code: "VALIDATION_ERROR" });
    if (!body.preview) await logLetter({ template, session, action: "DOWNLOADED_DOCX", values, employeeCode: body.employeeCode });
    return new NextResponse(new Uint8Array(docx), { headers: { "Content-Type": DOCX_MIME, "Content-Disposition": `attachment; filename="${fileBase(template.letterType, values)}.docx"`, "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Preparing the letter");
  }
}
