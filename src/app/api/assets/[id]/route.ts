import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES, PRIVILEGED_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { assertAssetUnique, assertItcRule, assetData, deriveAssetComputedFields } from "@/lib/assets";
import { apiError, validationError } from "@/lib/api-error";
import { AppError, notFound } from "@/lib/app-error";
import { deleteRecordSchema } from "@/lib/validators";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const { id } = await params;
    const patch = assetData(await req.json(), false);
    const asset = await db.$transaction(async (tx) => {
      const before = await tx.fixedAsset.findUnique({ where: { id } });
      if (!before) throw notFound("This asset");
      if (before.deletedAt) {
        throw new AppError(
          `Asset ${before.faId} is deleted, so it cannot be edited. Restore it from the deleted list first.`,
          { status: 409, code: "RECORD_DELETED" },
        );
      }
      assertItcRule(before, patch);
      await assertAssetUnique(
        tx,
        { faId: patch.faId !== before.faId ? patch.faId : undefined, serialNo: patch.serialNo !== before.serialNo ? patch.serialNo : undefined },
        id,
      );
      const activeAssignment = await tx.assetAssignment.findFirst({ where: { assetId: id, returnedAt: null } });
      if ((patch.status === "ASSIGNED" || patch.status === "PENDING_TRANSFER") && patch.status !== before.status) {
        throw new AppError(
          "Status: ASSIGNED and PENDING TRANSFER are set automatically by the transfer workflow. Choose Available, Under repair or Disposed here, or use the Transfers page to assign the asset.",
          { status: 409, code: "STATUS_MANAGED", fields: [{ field: "status", label: "Status", message: "This status is managed by the transfer workflow." }] },
        );
      }
      if (patch.status === "AVAILABLE" && activeAssignment) {
        throw new AppError(
          `Status: asset ${before.faId} is currently assigned to a custodian. Transfer or return it on the Transfers page before marking it Available.`,
          { status: 409, code: "STATUS_CONFLICT", fields: [{ field: "status", label: "Status", message: "Return or transfer the asset before marking it Available." }] },
        );
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
    return apiError(error, "Updating the asset");
  }
}

// Soft delete: the asset leaves the register and every report, but the row, its history
// and its QR record stay in the database. Who deleted it, when and why is kept both on the
// row and in the audit log, and a privileged user can restore it later.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = requireRole(
      req,
      PRIVILEGED_ROLES,
      "Only an Admin, CEO or COO can delete an asset. Ask one of them to delete it, or to grant you access.",
    );
    const { id } = await params;
    const parsed = deleteRecordSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);

    const asset = await db.$transaction(async (tx) => {
      const before = await tx.fixedAsset.findUnique({ where: { id } });
      if (!before) throw notFound("This asset");
      if (before.deletedAt) {
        throw new AppError(`Asset ${before.faId} is already deleted.`, { status: 409, code: "RECORD_DELETED" });
      }
      const custody = await tx.assetAssignment.findFirst({
        where: { assetId: id, returnedAt: null },
        include: { employee: { select: { permanentId: true, name: true } } },
      });
      if (custody) {
        const holder = custody.employee ? `${custody.employee.permanentId} (${custody.employee.name})` : custody.custodianName ?? "a custodian";
        throw new AppError(
          `Asset ${before.faId} cannot be deleted because it is currently assigned to ${holder}. Transfer it to another custodian or mark it returned on the Transfers page, then delete it.`,
          { status: 409, code: "ASSET_IN_CUSTODY" },
        );
      }
      const pending = await tx.assetTransfer.count({ where: { assetId: id, status: "PENDING" } });
      if (pending) {
        throw new AppError(
          `Asset ${before.faId} cannot be deleted because it has a pending transfer request. Approve, decline or revoke that request on the Transfers page first.`,
          { status: 409, code: "ASSET_HAS_PENDING_TRANSFER" },
        );
      }
      const after = await tx.fixedAsset.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedById: session.userId,
          deletedByEmail: session.email,
          deleteReason: parsed.data.reason,
        },
      });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "ASSET",
          recordType: "FixedAsset",
          recordId: id,
          action: "DELETED",
          previousValue: before,
          newValue: after,
          reason: parsed.data.reason,
        },
        tx,
      );
      return after;
    });
    return NextResponse.json({ data: asset });
  } catch (error) {
    return apiError(error, "Deleting the asset");
  }
}
