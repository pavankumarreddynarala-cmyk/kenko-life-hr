import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { transferRequestSchema } from "@/lib/validators";
import { assignAsset, transferInclude } from "@/lib/transfers";
import { apiError, validationError } from "@/lib/api-error";
import { AppError, notFound, unauthenticated } from "@/lib/app-error";
import { isManagementRole } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session) throw unauthenticated();
    const management = isManagementRole(session.role);
    if (!management && !session.employeeId) throw unauthenticated();
    const data = await db.assetTransfer.findMany({
      where: management
        ? { asset: { deletedAt: null } }
        : { OR: [{ senderId: session.employeeId }, { receiverId: session.employeeId }] },
      include: transferInclude,
      take: 500,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error, "Loading transfers");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session) throw unauthenticated();
    const parsed = transferRequestSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const management = isManagementRole(session.role);
    if (!management && !session.employeeId) throw unauthenticated();

    const transfer = await db.$transaction(async (tx) => {
      const receiver = await tx.employee.findUnique({ where: { permanentId: parsed.data.receiverEmployeeCode } });
      if (!receiver || receiver.deletedAt) {
        throw new AppError(
          `Receiving Employee ID: no active employee has the ID ${parsed.data.receiverEmployeeCode}. Check the ID in the Employee Master and enter it again.`,
          {
            status: 404,
            code: "NOT_FOUND",
            fields: [{ field: "receiverEmployeeCode", label: "Receiving Employee ID", message: "No active employee has this ID." }],
          },
        );
      }
      const asset = await tx.fixedAsset.findUnique({ where: { id: parsed.data.assetId } });
      if (!asset || asset.deletedAt) throw notFound("This asset");
      if (asset.status === "DISPOSED") {
        throw new AppError(`Asset ${asset.faId} is disposed and cannot be transferred. Choose an active asset.`, {
          status: 409,
          code: "ASSET_DISPOSED",
        });
      }
      const activeAssignment = await tx.assetAssignment.findFirst({
        where: { assetId: parsed.data.assetId, returnedAt: null },
      });
      const senderId = management ? activeAssignment?.employeeId : session.employeeId;
      if (!management && activeAssignment?.employeeId !== session.employeeId) {
        throw new AppError(`You cannot transfer asset ${asset.faId} because it is not currently assigned to you.`, {
          status: 403,
          code: "FORBIDDEN",
        });
      }
      if (senderId === receiver.id) {
        throw new AppError(
          `Asset ${asset.faId} is already assigned to ${receiver.permanentId} (${receiver.name}). Choose a different receiving employee.`,
          {
            status: 409,
            code: "CONFLICT",
            fields: [{ field: "receiverEmployeeCode", label: "Receiving Employee ID", message: "The asset is already with this employee." }],
          },
        );
      }
      const pending = await tx.assetTransfer.findFirst({
        where: { assetId: parsed.data.assetId, status: "PENDING" },
      });
      if (pending) {
        throw new AppError(
          `Asset ${asset.faId} already has a transfer request waiting for a decision. Approve, decline or revoke it on the Transfers page before starting another.`,
          { status: 409, code: "CONFLICT" },
        );
      }

      const effectiveDate = parsed.data.effectiveDate ?? new Date();
      const registeredDate = parsed.data.registeredDate ?? new Date();
      const status = management ? "ACCEPTED" : "PENDING";
      const created = await tx.assetTransfer.create({
        data: {
          assetId: parsed.data.assetId,
          senderId,
          receiverId: receiver.id,
          kind: management ? "ADMIN_TRANSFER" : "EMPLOYEE_REQUEST",
          status,
          reason: parsed.data.reason,
          effectiveDate,
          registeredDate,
          resolvedAt: management ? new Date() : undefined,
          events: {
            create: {
              action: management ? "ADMIN_TRANSFERRED" : "REQUESTED",
              actorId: session.userId,
              comment: parsed.data.reason,
            },
          },
        },
      });
      if (management) {
        await assignAsset(tx, parsed.data.assetId, receiver.id, effectiveDate, `Administrative transfer ${created.id}`);
      } else {
        await tx.fixedAsset.update({ where: { id: parsed.data.assetId }, data: { status: "PENDING_TRANSFER" } });
      }
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "ASSET",
          recordType: "AssetTransfer",
          recordId: created.id,
          action: management ? "ADMIN_TRANSFERRED" : "REQUESTED",
          newValue: {
            assetId: parsed.data.assetId,
            senderId,
            receiverId: receiver.id,
            effectiveDate,
            registeredDate,
            reason: parsed.data.reason,
          },
        },
        tx,
      );
      return tx.assetTransfer.findUniqueOrThrow({ where: { id: created.id }, include: transferInclude });
    });
    return NextResponse.json({ data: transfer }, { status: 201 });
  } catch (error) {
    return apiError(error, "Creating the transfer");
  }
}
