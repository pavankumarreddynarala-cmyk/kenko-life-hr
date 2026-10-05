import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PRIVILEGED_ROLES, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError, validationError } from "@/lib/api-error";
import { notFound } from "@/lib/app-error";
import { blockSchema } from "@/lib/depreciation-schemas";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = requireRole(req, [...PRIVILEGED_ROLES, "CFO"], "Only an Admin, CEO, COO or CFO can change depreciation settings.");
    const { id } = await params;
    const parsed = blockSchema.partial().safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const updated = await db.$transaction(async (tx) => {
      const before = await tx.taxBlock.findUnique({ where: { id } });
      if (!before) throw notFound("This record");
      const after = await tx.taxBlock.update({ where: { id }, data: { ...parsed.data, verified: parsed.data.verified ?? true } });
      await audit({ actorId: session.userId, email: session.email, role: session.role, module: "ASSET", recordType: "TaxBlock", recordId: id, action: "TAX_BLOCK_UPDATED", previousValue: before, newValue: after }, tx);
      return after;
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    return apiError(error, "Unable to update tax block");
  }
}
