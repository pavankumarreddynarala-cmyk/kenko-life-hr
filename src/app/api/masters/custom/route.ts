import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError, validationError } from "@/lib/api-error";
import { AppError } from "@/lib/app-error";
import { masterSchema } from "@/lib/master-schema";

// Lists every custom master type together with its values, for the Master Data page's
// "Custom" section and for any future dropdown that wants to consume them.
export async function GET(req: NextRequest) {
  try {
    requireRole(req, MANAGEMENT_ROLES);
    const data = await db.customMasterType.findMany({
      include: { values: { orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error, "Loading custom masters");
  }
}

// Creates a brand new master category (e.g. "Shift Type", code "SHIFT") with no values
// yet. Values are added afterwards via POST /api/masters/custom/[typeId]/values.
export async function POST(req: NextRequest) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const parsed = masterSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const created = await db.$transaction(async (tx) => {
      const clash = await tx.customMasterType.findFirst({
        where: { OR: [{ name: { equals: parsed.data.name, mode: "insensitive" } }, { code: parsed.data.code }] },
      });
      if (clash) {
        const field = clash.code === parsed.data.code ? "code" : "name";
        throw new AppError(
          `A master named “${clash.name}” with code ${clash.code} already exists. Enter a different ${field}, or open the existing master from the list.`,
          { status: 409, code: "DUPLICATE_VALUE", fields: [{ field, label: field === "code" ? "Code" : "Name", message: `This ${field} is already used by “${clash.name}”.` }] },
        );
      }
      const type = await tx.customMasterType.create({ data: parsed.data });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "ORGANISATION",
          recordType: "CustomMasterType",
          recordId: type.id,
          action: "MASTER_TYPE_CREATED",
          newValue: type,
        },
        tx,
      );
      return type;
    });
    return NextResponse.json({ data: { ...created, values: [] } }, { status: 201 });
  } catch (error) {
    return apiError(error, "Creating the master");
  }
}
