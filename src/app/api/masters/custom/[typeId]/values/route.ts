import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError, validationError } from "@/lib/api-error";
import { AppError, notFound } from "@/lib/app-error";
import { customValueSchema } from "@/lib/master-schema";

// Adds one coded value under an existing custom master type (e.g. under "Shift Type":
// code "NIGHT", name "Night Shift"). This is what lets an admin grow a custom master's
// value list over time without any code change.
export async function POST(req: NextRequest, { params }: { params: Promise<{ typeId: string }> }) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const { typeId } = await params;
    const parsed = customValueSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);

    const created = await db.$transaction(async (tx) => {
      const type = await tx.customMasterType.findUnique({ where: { id: typeId } });
      if (!type) throw notFound("This master");
      const clash = await tx.customMasterValue.findFirst({
        where: { typeId, OR: [{ name: { equals: parsed.data.name, mode: "insensitive" } }, { code: parsed.data.code }] },
      });
      if (clash) {
        const field = clash.code === parsed.data.code ? "code" : "name";
        throw new AppError(
          `“${type.name}” already has a value named “${clash.name}” with code ${clash.code}. Enter a different ${field}, or edit the existing value instead.`,
          { status: 409, code: "DUPLICATE_VALUE", fields: [{ field, label: field === "code" ? "Code" : "Name", message: `This ${field} is already used by “${clash.name}”.` }] },
        );
      }
      const value = await tx.customMasterValue.create({ data: { ...parsed.data, typeId } });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "ORGANISATION",
          recordType: "CustomMasterValue",
          recordId: value.id,
          action: "MASTER_VALUE_CREATED",
          newValue: value,
          metadata: { typeId, typeName: type.name },
        },
        tx,
      );
      return value;
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return apiError(error, "Adding the value");
  }
}
