import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MANAGEMENT_ROLES, PRIVILEGED_ROLES, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError, validationError } from "@/lib/api-error";

import { blockSchema } from "@/lib/depreciation-schemas";

export async function GET(req: NextRequest) {
  try {
    requireRole(req, MANAGEMENT_ROLES);
    return NextResponse.json({ data: await db.taxBlock.findMany({ orderBy: { name: "asc" } }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Unable to load tax blocks");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireRole(req, [...PRIVILEGED_ROLES, "CFO"], "Only an Admin, CEO, COO or CFO can change depreciation settings.");
    const parsed = blockSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const created = await db.$transaction(async (tx) => {
      const row = await tx.taxBlock.create({ data: { ...parsed.data, verified: true } });
      await audit({ actorId: session.userId, email: session.email, role: session.role, module: "ASSET", recordType: "TaxBlock", recordId: row.id, action: "TAX_BLOCK_CREATED", newValue: row }, tx);
      return row;
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return apiError(error, "Unable to save tax block");
  }
}
