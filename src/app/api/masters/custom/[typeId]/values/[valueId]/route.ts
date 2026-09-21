import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES, PRIVILEGED_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError, validationError } from "@/lib/api-error";
import { AppError, notFound } from "@/lib/app-error";
import { customValueSchema } from "@/lib/master-schema";

type Params = { params: Promise<{ typeId: string; valueId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const { typeId, valueId } = await params;
    const parsed = customValueSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);

    const updated = await db.$transaction(async (tx) => {
      const before = await tx.customMasterValue.findFirst({ where: { id: valueId, typeId }, include: { type: true } });
      if (!before) throw notFound("This value");
      const clash = await tx.customMasterValue.findFirst({
        where: { typeId, NOT: { id: valueId }, OR: [{ name: { equals: parsed.data.name, mode: "insensitive" } }, { code: parsed.data.code }] },
      });
      if (clash) {
        const field = clash.code === parsed.data.code ? "code" : "name";
        throw new AppError(
          `“${before.type.name}” already has a value named “${clash.name}” with code ${clash.code}. Enter a different ${field} so the values stay unique.`,
          { status: 409, code: "DUPLICATE_VALUE", fields: [{ field, label: field === "code" ? "Code" : "Name", message: `This ${field} is already used by “${clash.name}”.` }] },
        );
      }
      const after = await tx.customMasterValue.update({ where: { id: valueId }, data: parsed.data });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "ORGANISATION",
          recordType: "CustomMasterValue",
          recordId: valueId,
          action: "MASTER_VALUE_UPDATED",
          previousValue: { id: before.id, name: before.name, code: before.code },
          newValue: after,
          metadata: { typeId, typeName: before.type.name },
        },
        tx,
      );
      return after;
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    return apiError(error, "Editing the value");
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const session = requireRole(
      req,
      PRIVILEGED_ROLES,
      "Only an Admin, CEO or COO can delete master data. Ask one of them to delete this value.",
    );
    const { typeId, valueId } = await params;
    const removed = await db.$transaction(async (tx) => {
      const value = await tx.customMasterValue.findFirst({ where: { id: valueId, typeId }, include: { type: true } });
      if (!value) throw notFound("This value");
      await tx.customMasterValue.delete({ where: { id: valueId } });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "ORGANISATION",
          recordType: "CustomMasterValue",
          recordId: valueId,
          action: "MASTER_VALUE_DELETED",
          previousValue: { id: value.id, name: value.name, code: value.code },
          metadata: { typeId, typeName: value.type.name },
        },
        tx,
      );
      return { id: value.id, name: value.name, code: value.code };
    });
    return NextResponse.json({ data: removed });
  } catch (error) {
    return apiError(error, "Deleting the value");
  }
}
