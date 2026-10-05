import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DOCUMENT_ROLES, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError, validationError } from "@/lib/api-error";
import { notFound } from "@/lib/app-error";
import { readFile, SOP_LIST_SELECT, sopFieldsSchema } from "@/lib/sops";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// Edit the details / who sees it, and optionally replace the file (which raises the version).
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const session = requireRole(req, DOCUMENT_ROLES, "Only an Admin, CEO, COO or HR can change SOPs.");
    const id = (await params).id;
    const before = await db.sopDocument.findUnique({ where: { id }, select: SOP_LIST_SELECT });
    if (!before) throw notFound("The SOP");
    const form = await req.formData();
    const parsed = sopFieldsSchema.safeParse(Object.fromEntries(["title", "description", "audience", "departmentIds", "roleIds"].map((k) => [k, form.get(k) ?? undefined])));
    if (!parsed.success) return validationError(parsed.error);
    const file = readFile(form.get("file"));
    const after = await db.sopDocument.update({
      where: { id },
      data: {
        ...parsed.data,
        description: parsed.data.description ?? null,
        ...(file ? { fileName: file.name, mimeType: file.mimeType, sizeBytes: file.size, content: Buffer.from(await file.file.arrayBuffer()), version: { increment: 1 }, uploadedByEmail: session.email } : {}),
      },
      select: SOP_LIST_SELECT,
    });
    const retagged = before.audience !== after.audience || before.departmentIds.join() !== after.departmentIds.join() || before.roleIds.join() !== after.roleIds.join();
    await audit({
      actorId: session.userId, email: session.email, role: session.role, module: "SOP", recordType: "SopDocument", recordId: id,
      action: file ? "FILE_REPLACED" : retagged ? "RETAGGED" : "UPDATED",
      previousValue: { title: before.title, fileName: before.fileName, version: before.version, audience: before.audience, departmentIds: before.departmentIds, roleIds: before.roleIds },
      newValue: { title: after.title, fileName: after.fileName, version: after.version, audience: after.audience, departmentIds: after.departmentIds, roleIds: after.roleIds },
    });
    return NextResponse.json({ data: after });
  } catch (error) {
    return apiError(error, "Saving the SOP");
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const session = requireRole(req, DOCUMENT_ROLES, "Only an Admin, CEO, COO or HR can delete SOPs.");
    const id = (await params).id;
    const before = await db.sopDocument.findUnique({ where: { id }, select: SOP_LIST_SELECT });
    if (!before) throw notFound("The SOP");
    await db.sopDocument.delete({ where: { id } });
    await audit({ actorId: session.userId, email: session.email, role: session.role, module: "SOP", recordType: "SopDocument", recordId: id, action: "DELETED", previousValue: { title: before.title, fileName: before.fileName } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "Deleting the SOP");
  }
}
