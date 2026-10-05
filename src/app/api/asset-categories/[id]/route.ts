import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PRIVILEGED_ROLES, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError, validationError } from "@/lib/api-error";
import { notFound } from "@/lib/app-error";
import { categorySchema } from "@/lib/depreciation-schemas";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = requireRole(req, [...PRIVILEGED_ROLES, "CFO"], "Only an Admin, CEO, COO or CFO can change depreciation settings.");
    const { id } = await params;
    const parsed = categorySchema.partial().safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const updated = await db.$transaction(async (tx) => {
      const before = await tx.assetCategory.findUnique({ where: { id } });
      if (!before) throw notFound("This record");
      // Saving any change confirms the values, clearing the "placeholder" flag.
      const after = await tx.assetCategory.update({ where: { id }, data: { ...parsed.data, verified: parsed.data.verified ?? true } });
      await audit({ actorId: session.userId, email: session.email, role: session.role, module: "ASSET", recordType: "AssetCategory", recordId: id, action: "CATEGORY_UPDATED", previousValue: before, newValue: after }, tx);
      return after;
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    return apiError(error, "Unable to update category");
  }
}
