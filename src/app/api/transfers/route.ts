import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { transferRequestSchema } from "@/lib/validators";
import { assignAsset, transferInclude } from "@/lib/transfers";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const management = ["ADMIN", "HR", "CFO"].includes(session.role);
  if (!management && !session.employeeId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await db.assetTransfer.findMany({
    where: management ? undefined : { OR: [{ senderId: session.employeeId }, { receiverId: session.employeeId }] },
    include: transferInclude,
    take: 500,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = transferRequestSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const management = ["ADMIN", "HR", "CFO"].includes(session.role);
  if (!management && !session.employeeId) {
    return NextResponse.json({ error: "Employee authentication required" }, { status: 401 });
  }

  try {
    const transfer = await db.$transaction(async (tx) => {
      const receiver = await tx.employee.findUnique({ where: { permanentId: parsed.data.receiverEmployeeCode } });
      if (!receiver) throw new Error("Receiving Employee ID was not found");
      const asset = await tx.fixedAsset.findUnique({ where: { id: parsed.data.assetId } });
      if (!asset) throw new Error("Asset was not found in the register");
      if (asset.status === "DISPOSED") throw new Error("Disposed assets cannot be transferred");
      const activeAssignment = await tx.assetAssignment.findFirst({
        where: { assetId: parsed.data.assetId, returnedAt: null },
      });
      const senderId = management ? activeAssignment?.employeeId : session.employeeId;
      if (!management && activeAssignment?.employeeId !== session.employeeId) {
        throw new Error("You do not currently hold this asset");
      }
      if (senderId === receiver.id) throw new Error("The asset is already assigned to this employee");
      const pending = await tx.assetTransfer.findFirst({
        where: { assetId: parsed.data.assetId, status: "PENDING" },
      });
      if (pending) throw new Error("This asset already has a pending transfer request");

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
    const message = error instanceof Error ? error.message : "Unable to create transfer";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
