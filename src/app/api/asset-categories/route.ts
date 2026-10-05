import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MANAGEMENT_ROLES, PRIVILEGED_ROLES, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError, validationError } from "@/lib/api-error";

import { categorySchema } from "@/lib/depreciation-schemas";

export async function GET(req: NextRequest) {
  try {
    requireRole(req, MANAGEMENT_ROLES);
    const data = await db.assetCategory.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Unable to load asset categories");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireRole(req, [...PRIVILEGED_ROLES, "CFO"], "Only an Admin, CEO, COO or CFO can change depreciation settings.");
    const parsed = categorySchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const created = await db.$transaction(async (tx) => {
      const row = await tx.assetCategory.create({ data: { ...parsed.data, verified: true } });
      await audit({ actorId: session.userId, email: session.email, role: session.role, module: "ASSET", recordType: "AssetCategory", recordId: row.id, action: "CATEGORY_CREATED", newValue: row }, tx);
      return row;
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return apiError(error, "Unable to save category");
  }
}
