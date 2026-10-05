import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PRIVILEGED_ROLES, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError } from "@/lib/api-error";
import { AppError, notFound } from "@/lib/app-error";
import { extractFields } from "@/lib/letters";
import { readFile } from "@/lib/sops";
import { TEMPLATE_SELECT } from "@/lib/letter-service";

export const dynamic = "force-dynamic";

// Replace the Word file (raises the version) and/or switch the template on or off.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = requireRole(req, PRIVILEGED_ROLES, "Only an Admin, CEO or COO can change letter templates.");
    const id = (await params).id;
    const before = await db.letterTemplate.findUnique({ where: { id }, select: TEMPLATE_SELECT });
    if (!before) throw notFound("The template");
    const form = await req.formData();
    const data: Record<string, unknown> = {};
    const name = form.get("name");
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    const active = form.get("active");
    if (active === "true" || active === "false") data.active = active === "true";
    const file = readFile(form.get("file"), ["docx"]);
    if (file) {
      const content = Buffer.from(await file.file.arrayBuffer());
      const fields = extractFields(content);
      if (fields.length === 0) throw new AppError("No editable fields were found in this file. Mark each spot that changes with double braces, for example {{employee_name}}.", { status: 400, code: "TEMPLATE_NO_FIELDS", fields: [{ field: "file", message: "No {{fields}} found in the document." }] });
      Object.assign(data, { content, fields, fileName: file.name, version: { increment: 1 }, uploadedByEmail: session.email });
    }
    const after = await db.letterTemplate.update({ where: { id }, data, select: TEMPLATE_SELECT });
    await audit({ actorId: session.userId, email: session.email, role: session.role, module: "LETTER", recordType: "LetterTemplate", recordId: id, action: file ? "TEMPLATE_REPLACED" : "TEMPLATE_UPDATED", previousValue: { name: before.name, active: before.active, version: before.version }, newValue: { name: after.name, active: after.active, version: after.version, fields: after.fields } });
    return NextResponse.json({ data: after });
  } catch (error) {
    return apiError(error, "Saving the template");
  }
}
