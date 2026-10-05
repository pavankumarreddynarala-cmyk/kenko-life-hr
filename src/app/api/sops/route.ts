import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DOCUMENT_ROLES, MANAGEMENT_ROLES, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError, validationError } from "@/lib/api-error";
import { AppError } from "@/lib/app-error";
import { readFile, SOP_LIST_SELECT, sopFieldsSchema } from "@/lib/sops";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    requireRole(req, MANAGEMENT_ROLES);
    const data = await db.sopDocument.findMany({ select: SOP_LIST_SELECT, orderBy: { updatedAt: "desc" } });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Loading SOPs");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireRole(req, DOCUMENT_ROLES, "Only an Admin, CEO, COO or HR can upload SOPs.");
    const form = await req.formData();
    const parsed = sopFieldsSchema.safeParse(Object.fromEntries(["title", "description", "audience", "departmentIds", "roleIds"].map((k) => [k, form.get(k) ?? undefined])));
    if (!parsed.success) return validationError(parsed.error);
    const file = readFile(form.get("file"));
    if (!file) throw new AppError("Choose the document to upload.", { status: 400, code: "FILE_REQUIRED", fields: [{ field: "file", message: "Choose a file." }] });
    const content = Buffer.from(await file.file.arrayBuffer());
    const sop = await db.sopDocument.create({
      data: { ...parsed.data, fileName: file.name, mimeType: file.mimeType, sizeBytes: file.size, content, uploadedByEmail: session.email },
      select: SOP_LIST_SELECT,
    });
    await audit({ actorId: session.userId, email: session.email, role: session.role, module: "SOP", recordType: "SopDocument", recordId: sop.id, action: "CREATED", newValue: { title: sop.title, fileName: sop.fileName, audience: sop.audience, departmentIds: sop.departmentIds, roleIds: sop.roleIds } });
    return NextResponse.json({ data: sop }, { status: 201 });
  } catch (error) {
    return apiError(error, "Uploading the SOP");
  }
}
