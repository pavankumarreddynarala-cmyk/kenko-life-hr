import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { transferUpdateSchema } from "@/lib/validators";
import { assignAsset, transferInclude } from "@/lib/transfers";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = transferUpdateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { id } = await params;
  const management = ["ADMIN", "HR", "CFO"].includes(session.role);

  try {
    const result = await db.$transaction(async (tx) => {
      const before = await tx.assetTransfer.findUnique({ where: { id }, include: transferInclude });
      if (!before) throw new Error("Transfer not found");

      if (parsed.data.action) {
        if (before.status !== "PENDING") throw new Error("Transfer request has already been resolved");
        const isReceiver = session.employeeId === before.receiverId;
        const isSender = session.employeeId === before.senderId;
        if (["ACCEPT", "REJECT"].includes(parsed.data.action) && !isReceiver) {
          throw new Error("Only the receiving employee can decide this request");
        }
        if (parsed.data.action === "REVOKE" && !isSender && !management) {
          throw new Error("Only the sending employee can revoke this request");
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
        if (update.count !== 1) throw new Error("Transfer request has already been resolved");
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
        if (!management) throw new Error("Management access required");
        if (before.status === "REJECTED" || before.status === "REVOKED") {
          throw new Error("Rejected or revoked transfers are immutable");
        }
        if (before.asset.status === "DISPOSED") throw new Error("Disposed assets cannot be transferred");
        const receiver = parsed.data.receiverEmployeeCode
          ? await tx.employee.findUnique({ where: { permanentId: parsed.data.receiverEmployeeCode } })
          : before.receiver;
        if (!receiver) throw new Error("Receiving Employee ID was not found");
        if (receiver.id === before.senderId) throw new Error("Sender and receiver must be different");
        const effectiveDate = parsed.data.effectiveDate ?? before.effectiveDate;
        const registeredDate = parsed.data.registeredDate ?? before.registeredDate;
        const receiverChanged = receiver.id !== before.receiverId;
        const effectiveDateChanged = effectiveDate.getTime() !== before.effectiveDate.getTime();
        if (before.status === "ACCEPTED" && (receiverChanged || effectiveDateChanged) && !parsed.data.reason) {
          throw new Error("A reason is required when changing an accepted transfer");
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
    const message = error instanceof Error ? error.message : "Unable to update transfer";
    const status = message.includes("access") || message.startsWith("Only") ? 403 : message.includes("not found") ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
