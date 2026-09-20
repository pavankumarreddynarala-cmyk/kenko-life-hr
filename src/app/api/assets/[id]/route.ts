import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { assetData, deriveAssetComputedFields } from "@/lib/assets";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const { id } = await params;
    const patch = assetData(await req.json(), false);
    const asset = await db.$transaction(async (tx) => {
      const before = await tx.fixedAsset.findUnique({ where: { id } });
      if (!before) throw new Error("Asset not found");
      const activeAssignment = await tx.assetAssignment.findFirst({ where: { assetId: id, returnedAt: null } });
      if ((patch.status === "ASSIGNED" || patch.status === "PENDING_TRANSFER") && patch.status !== before.status) {
        throw new Error("Assigned and pending-transfer statuses are managed by the transfer workflow");
      }
      if (patch.status === "AVAILABLE" && activeAssignment) {
        throw new Error("Transfer or return the assigned asset before marking it available");
      }
      if (patch.status === "DISPOSED" && activeAssignment) {
        await tx.assetAssignment.update({ where: { id: activeAssignment.id }, data: { returnedAt: new Date(), notes: "Asset disposed" } });
      }
      if (patch.status === "DISPOSED") {
        const pending = await tx.assetTransfer.findMany({ where: { assetId: id, status: "PENDING" }, select: { id: true } });
        if (pending.length) {
          await tx.assetTransfer.updateMany({
            where: { id: { in: pending.map((transfer) => transfer.id) }, status: "PENDING" },
            data: { status: "REVOKED", revokedAt: new Date() },
          });
          await tx.assetTransferEvent.createMany({
            data: pending.map((transfer) => ({
              transferId: transfer.id,
              action: "REVOKED_ASSET_DISPOSED",
              actorId: session.userId,
            })),
          });
          for (const transfer of pending) {
            await audit(
              {
                actorId: session.userId,
                email: session.email,
                role: session.role,
                module: "ASSET",
                recordType: "AssetTransfer",
                recordId: transfer.id,
                action: "REVOKED_ASSET_DISPOSED",
              },
              tx,
            );
          }
        }
      }
      const data = { ...patch, ...deriveAssetComputedFields(before, patch) };
      const after = await tx.fixedAsset.update({ where: { id }, data: data as never, include: { qr: true } });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "ASSET",
          recordType: "FixedAsset",
          recordId: id,
          action: "UPDATED",
          previousValue: before,
          newValue: after,
        },
        tx,
      );
      return after;
    });
    return NextResponse.json({ data: asset });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update asset";
    return NextResponse.json({ error: message }, { status: message === "Asset not found" ? 404 : 409 });
  }
}
