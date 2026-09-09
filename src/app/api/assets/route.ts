import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { assetData } from "@/lib/assets";
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
    requireRole(req, ["ADMIN", "HR", "CFO"]);
    const data = await db.fixedAsset.findMany({ include, take: 500, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error, "Unable to load assets");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireRole(req, ["ADMIN", "CFO"]);
    const data = { ...assetData(await req.json(), true), status: "AVAILABLE" as const };
    const asset = await db.$transaction(async (tx) => {
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
    const message = error instanceof Error ? error.message : "Unable to create asset";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
