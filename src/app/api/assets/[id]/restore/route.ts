import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, PRIVILEGED_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError } from "@/lib/api-error";
import { AppError, notFound } from "@/lib/app-error";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = requireRole(
      req,
      PRIVILEGED_ROLES,
      "Only an Admin, CEO or COO can restore a deleted asset. Ask one of them to restore it.",
    );
    const { id } = await params;
    const asset = await db.$transaction(async (tx) => {
      const before = await tx.fixedAsset.findUnique({ where: { id } });
      if (!before) throw notFound("This asset");
      if (!before.deletedAt) {
        throw new AppError(`Asset ${before.faId} is not deleted, so there is nothing to restore.`, { status: 409, code: "NOT_DELETED" });
      }
      const after = await tx.fixedAsset.update({
        where: { id },
        data: { deletedAt: null, deletedById: null, deletedByEmail: null, deleteReason: null },
      });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "ASSET",
          recordType: "FixedAsset",
          recordId: id,
          action: "RESTORED",
          previousValue: before,
          newValue: after,
        },
        tx,
      );
      return after;
    });
    return NextResponse.json({ data: asset });
  } catch (error) {
    return apiError(error, "Restoring the asset");
  }
}
