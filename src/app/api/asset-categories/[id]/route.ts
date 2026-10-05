import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError } from "@/lib/api-error";
import { categorySchema } from "@/lib/depreciation-schemas";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = requireRole(req, ["ADMIN", "CFO"]);
    const { id } = await params;
    const parsed = categorySchema.partial().safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const updated = await db.$transaction(async (tx) => {
      const before = await tx.assetCategory.findUnique({ where: { id } });
      if (!before) throw new Error("NOT_FOUND");
      // Saving any change confirms the values, clearing the "placeholder" flag.
      const after = await tx.assetCategory.update({ where: { id }, data: { ...parsed.data, verified: parsed.data.verified ?? true } });
      await audit({ actorId: session.userId, email: session.email, role: session.role, module: "ASSET", recordType: "AssetCategory", recordId: id, action: "CATEGORY_UPDATED", previousValue: before, newValue: after }, tx);
      return after;
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "A category with this name already exists" }, { status: 409 });
    return apiError(error, "Unable to update category");
  }
}
