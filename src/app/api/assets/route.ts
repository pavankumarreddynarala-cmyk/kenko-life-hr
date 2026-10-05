import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { assertAssetUnique, assertItcRule, assetData, deriveAssetComputedFields } from "@/lib/assets";
import { apiError } from "@/lib/api-error";

const include = {
  qr: true,
  company: true,
  location: true,
  department: true,
  costCentre: true,
  assignments: {
    where: { returnedAt: null },
    include: { employee: { select: { id: true, permanentId: true, name: true } } },
    take: 1,
  },
} as const;

export async function GET(req: NextRequest) {
  try {
    requireRole(req, MANAGEMENT_ROLES);
    // Default view hides deleted assets; ?deleted=1 lists them (deletion history).
    const wantDeleted = req.nextUrl.searchParams.get("deleted") === "1";
    const data = await db.fixedAsset.findMany({
      where: { deletedAt: wantDeleted ? { not: null } : null },
      include,
      take: 500,
      orderBy: wantDeleted ? { deletedAt: "desc" } : { createdAt: "desc" },
    });
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error, "Loading assets");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const rawData = { ...assetData(await req.json(), true), status: "AVAILABLE" as const };
    assertItcRule({}, rawData);
    const data = { ...rawData, ...deriveAssetComputedFields({}, rawData) };
    const asset = await db.$transaction(async (tx) => {
      await assertAssetUnique(tx, rawData as { faId?: unknown; serialNo?: unknown });
      const created = await tx.fixedAsset.create({ data: { ...data, qr: { create: {} } } as never, include });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "ASSET",
          recordType: "FixedAsset",
          recordId: created.id,
          action: "CREATED",
          newValue: created,
        },
        tx,
      );
      return created;
    });
    return NextResponse.json({ data: asset }, { status: 201 });
  } catch (error) {
    return apiError(error, "Adding the asset");
  }
}
