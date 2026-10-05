import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DOCUMENT_ROLES, PRIVILEGED_ROLES, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError } from "@/lib/api-error";
import { AppError } from "@/lib/app-error";
import { extractFields } from "@/lib/letters";
import { TEMPLATE_SELECT } from "@/lib/letter-service";
import { readFile } from "@/lib/sops";
import { LETTER_TYPES } from "@/lib/letter-fields";
import { mailConfigured, replyToAddress } from "@/lib/mail";
import { pdfConfigured } from "@/lib/pdf-convert";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    requireRole(req, DOCUMENT_ROLES, "Only an Admin, CEO, COO or HR can use letter templates.");
    const data = await db.letterTemplate.findMany({ select: TEMPLATE_SELECT, orderBy: [{ letterType: "asc" }, { name: "asc" }] });
    return NextResponse.json({ data, config: { pdf: pdfConfigured(), mail: mailConfigured(), replyTo: replyToAddress() } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Loading letter templates");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireRole(req, PRIVILEGED_ROLES, "Only an Admin, CEO or COO can upload letter templates.");
    const form = await req.formData();
    const name = String(form.get("name") ?? "").trim();
    const letterType = String(form.get("letterType") ?? "");
    if (name.length < 2) throw new AppError("Enter a name for the template.", { status: 400, code: "VALIDATION_ERROR", fields: [{ field: "name", message: "Enter a name (at least 2 characters)." }] });
    if (!LETTER_TYPES.some(([key]) => key === letterType)) throw new AppError("Choose the type of letter.", { status: 400, code: "VALIDATION_ERROR", fields: [{ field: "letterType", message: "Choose a letter type." }] });
    const file = readFile(form.get("file"), ["docx"]);
    if (!file) throw new AppError("Choose the Word (.docx) template to upload.", { status: 400, code: "FILE_REQUIRED", fields: [{ field: "file", message: "Choose a .docx file." }] });
    const content = Buffer.from(await file.file.arrayBuffer());
    const fields = extractFields(content);
    if (fields.length === 0) {
      throw new AppError("No editable fields were found in this file. Mark each spot that changes with double braces, for example {{employee_name}}, then upload again.", { status: 400, code: "TEMPLATE_NO_FIELDS", fields: [{ field: "file", message: "No {{fields}} found in the document." }] });
    }
    const template = await db.letterTemplate.create({ data: { name, letterType, fileName: file.name, content, fields, uploadedByEmail: session.email }, select: TEMPLATE_SELECT });
    await audit({ actorId: session.userId, email: session.email, role: session.role, module: "LETTER", recordType: "LetterTemplate", recordId: template.id, action: "TEMPLATE_UPLOADED", newValue: { name, letterType, fileName: file.name, fields } });
    return NextResponse.json({ data: template }, { status: 201 });
  } catch (error) {
    return apiError(error, "Uploading the template");
  }
}
