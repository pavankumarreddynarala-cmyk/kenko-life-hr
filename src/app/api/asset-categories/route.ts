import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError } from "@/lib/api-error";
import { categorySchema } from "@/lib/depreciation-schemas";


export async function GET(req: NextRequest) {
  try {
    requireRole(req, ["ADMIN", "HR", "CFO"]);
    const data = await db.assetCategory.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Unable to load asset categories");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireRole(req, ["ADMIN", "CFO"]);
    const parsed = categorySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const created = await db.$transaction(async (tx) => {
      const row = await tx.assetCategory.create({ data: { ...parsed.data, verified: true } });
      await audit({ actorId: session.userId, email: session.email, role: session.role, module: "ASSET", recordType: "AssetCategory", recordId: row.id, action: "CATEGORY_CREATED", newValue: row }, tx);
      return row;
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "A category with this name already exists" }, { status: 409 });
    return apiError(error, "Unable to save category");
  }
}
