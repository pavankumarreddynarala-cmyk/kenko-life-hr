import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { transferUpdateSchema } from "@/lib/validators";
import { assignAsset, transferInclude } from "@/lib/transfers";
import { apiError, validationError } from "@/lib/api-error";
import { AppError, forbidden, notFound, unauthenticated } from "@/lib/app-error";
import { isManagementRole } from "@/lib/permissions";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(req);
    if (!session) throw unauthenticated();
    const parsed = transferUpdateSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const { id } = await params;
    const management = isManagementRole(session.role);

    const result = await db.$transaction(async (tx) => {
      const before = await tx.assetTransfer.findUnique({ where: { id }, include: transferInclude });
      if (!before) throw notFound("This transfer");

      if (parsed.data.action) {
        if (before.status !== "PENDING") {
          throw new AppError(
            `This request was already ${before.status.toLowerCase()}, so it cannot be changed. Refresh the page to see its current state.`,
            { status: 409, code: "ALREADY_RESOLVED" },
          );
        }
        const isReceiver = session.employeeId === before.receiverId;
        const isSender = session.employeeId === before.senderId;
        if (["ACCEPT", "REJECT"].includes(parsed.data.action) && !isReceiver) {
          throw forbidden("Only the employee who is receiving the asset can approve or decline this request.");
        }
        if (parsed.data.action === "REVOKE" && !isSender && !management) {
          throw forbidden("Only the employee who sent this request (or management) can revoke it.");
        }
        const status =
          parsed.data.action === "ACCEPT" ? "ACCEPTED" : parsed.data.action === "REJECT" ? "REJECTED" : "REVOKED";
        const update = await tx.assetTransfer.updateMany({
          where: { id, status: "PENDING" },
          data: {
            status,
            resolvedAt: status === "ACCEPTED" || status === "REJECTED" ? new Date() : undefined,
            revokedAt: status === "REVOKED" ? new Date() : undefined,
          },
        });
        if (update.count !== 1) {
          throw new AppError("Someone else already resolved this request. Refresh the page to see its current state.", {
            status: 409,
            code: "ALREADY_RESOLVED",
          });
        }
        await tx.assetTransferEvent.create({
          data: { transferId: id, action: parsed.data.action, actorId: session.userId },
        });
        if (status === "ACCEPTED") {
          await assignAsset(tx, before.assetId, before.receiverId, before.effectiveDate, `Accepted transfer ${id}`);
        } else {
          const active = await tx.assetAssignment.findFirst({ where: { assetId: before.assetId, returnedAt: null } });
          await tx.fixedAsset.update({
            where: { id: before.assetId },
            data: { status: active ? "ASSIGNED" : "AVAILABLE" },
          });
        }
        await audit(
          {
            actorId: session.userId,
            email: session.email,
            role: session.role,
            module: "ASSET",
            recordType: "AssetTransfer",
            recordId: id,
            action: status,
            previousValue: { status: before.status },
            newValue: { status },
          },
          tx,
        );
      } else {
        if (!management) throw forbidden("Only management can edit a transfer. Ask HR or an Admin to make this change.");
        if (before.status === "REJECTED" || before.status === "REVOKED") {
          throw new AppError(
            `A ${before.status.toLowerCase()} transfer is closed and cannot be edited. Create a new transfer instead.`,
            { status: 409, code: "IMMUTABLE" },
          );
        }
        if (before.asset.status === "DISPOSED") {
          throw new AppError(`Asset ${before.asset.faId} is disposed and cannot be transferred.`, {
            status: 409,
            code: "ASSET_DISPOSED",
          });
        }
        const receiver = parsed.data.receiverEmployeeCode
          ? await tx.employee.findUnique({ where: { permanentId: parsed.data.receiverEmployeeCode } })
          : before.receiver;
        if (!receiver || receiver.deletedAt) {
          throw new AppError(
            `Receiving Employee ID: no active employee has the ID ${parsed.data.receiverEmployeeCode}. Check the ID in the Employee Master.`,
            {
              status: 404,
              code: "NOT_FOUND",
              fields: [{ field: "receiverEmployeeCode", label: "Receiving Employee ID", message: "No active employee has this ID." }],
            },
          );
        }
        if (receiver.id === before.senderId) {
          throw new AppError("The sender and the receiver must be different employees. Choose another receiver.", {
            status: 409,
            code: "CONFLICT",
          });
        }
        const effectiveDate = parsed.data.effectiveDate ?? before.effectiveDate;
        const registeredDate = parsed.data.registeredDate ?? before.registeredDate;
        const receiverChanged = receiver.id !== before.receiverId;
        const effectiveDateChanged = effectiveDate.getTime() !== before.effectiveDate.getTime();
        if (before.status === "ACCEPTED" && (receiverChanged || effectiveDateChanged) && !parsed.data.reason) {
          throw new AppError(
            "Reason: a reason is required when you change the receiver or effective date of an accepted transfer. Enter why it is being changed.",
            {
              status: 400,
              code: "VALIDATION_ERROR",
              fields: [{ field: "reason", label: "Reason", message: "Enter why this accepted transfer is being changed." }],
            },
          );
        }
        await tx.assetTransfer.update({
          where: { id },
          data: {
            receiverId: receiver.id,
            reason: parsed.data.reason ?? before.reason,
            effectiveDate,
            registeredDate,
            events: { create: { action: "ADMIN_EDITED", actorId: session.userId, comment: parsed.data.reason } },
          },
        });
        if (before.status === "ACCEPTED" && (receiverChanged || effectiveDateChanged)) {
          await assignAsset(tx, before.assetId, receiver.id, effectiveDate, `Updated transfer ${id}`);
        }
        await audit(
          {
            actorId: session.userId,
            email: session.email,
            role: session.role,
            module: "ASSET",
            recordType: "AssetTransfer",
            recordId: id,
            action: "UPDATED",
            previousValue: before,
            newValue: { receiverId: receiver.id, reason: parsed.data.reason, effectiveDate, registeredDate },
          },
          tx,
        );
      }
      return tx.assetTransfer.findUniqueOrThrow({ where: { id }, include: transferInclude });
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    return apiError(error, "Updating the transfer");
  }
}
