import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES, PRIVILEGED_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError, validationError } from "@/lib/api-error";
import { AppError, notFound } from "@/lib/app-error";
import { masterSchema } from "@/lib/master-schema";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ typeId: string }> }) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const { typeId } = await params;
    const parsed = masterSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);

    const updated = await db.$transaction(async (tx) => {
      const before = await tx.customMasterType.findUnique({ where: { id: typeId } });
      if (!before) throw notFound("This master");
      const clash = await tx.customMasterType.findFirst({
        where: { NOT: { id: typeId }, OR: [{ name: { equals: parsed.data.name, mode: "insensitive" } }, { code: parsed.data.code }] },
      });
      if (clash) {
        const field = clash.code === parsed.data.code ? "code" : "name";
        throw new AppError(
          `A master named “${clash.name}” with code ${clash.code} already exists. Enter a different ${field} so masters stay unique.`,
          { status: 409, code: "DUPLICATE_VALUE", fields: [{ field, label: field === "code" ? "Code" : "Name", message: `This ${field} is already used by “${clash.name}”.` }] },
        );
      }
      const after = await tx.customMasterType.update({ where: { id: typeId }, data: parsed.data });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "ORGANISATION",
          recordType: "CustomMasterType",
          recordId: typeId,
          action: "MASTER_TYPE_UPDATED",
          previousValue: before,
          newValue: after,
        },
        tx,
      );
      return after;
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    return apiError(error, "Editing the master");
  }
}

// A custom master can only be removed once it is empty, so its values are never lost as a
// side effect of deleting the category.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ typeId: string }> }) {
  try {
    const session = requireRole(
      req,
      PRIVILEGED_ROLES,
      "Only an Admin, CEO or COO can delete master data. Ask one of them to delete this master.",
    );
    const { typeId } = await params;
    const removed = await db.$transaction(async (tx) => {
      const type = await tx.customMasterType.findUnique({ where: { id: typeId }, include: { _count: { select: { values: true } } } });
      if (!type) throw notFound("This master");
      if (type._count.values > 0) {
        throw new AppError(
          `The master “${type.name}” cannot be deleted because it still contains ${type._count.values} value(s). Delete or move its values first, then delete the master.`,
          { status: 409, code: "MASTER_IN_USE" },
        );
      }
      await tx.customMasterType.delete({ where: { id: typeId } });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "ORGANISATION",
          recordType: "CustomMasterType",
          recordId: typeId,
          action: "MASTER_TYPE_DELETED",
          previousValue: { id: type.id, name: type.name, code: type.code },
        },
        tx,
      );
      return { id: type.id, name: type.name, code: type.code };
    });
    return NextResponse.json({ data: removed });
  } catch (error) {
    return apiError(error, "Deleting the master");
  }
}
