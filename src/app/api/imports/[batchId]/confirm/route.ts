import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { allocateEmployeeCode, employeeInclude, refreshDynamicEmployeeCode } from "@/lib/employees";
import { deriveAssetComputedFields } from "@/lib/assets";
import { apiError } from "@/lib/api-error";
import { AppError } from "@/lib/app-error";

const assetInclude = { qr: true, company: true, location: true, department: true, costCentre: true } as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const { batchId } = await params;
    const batch = await db.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) return NextResponse.json({ error: "Import batch not found" }, { status: 404 });
    if (batch.status === "IMPORTED") return NextResponse.json({ error: "This batch has already been imported" }, { status: 409 });
    if (batch.status !== "READY" || !batch.payload) return NextResponse.json({ error: "This batch has no validated rows to import" }, { status: 409 });

    const rows = batch.payload as Record<string, unknown>[];
    let imported = 0;
    const failures: { rowNumber: unknown; message: string }[] = [];

    for (const row of rows) {
      const { __rowNumber, ...data } = row;
      try {
        if (batch.type === "employees") {
          await db.$transaction(
            async (tx) => {
              const permanentId = await allocateEmployeeCode(tx);
              const created = await tx.employee.create({ data: { ...(data as Record<string, unknown>), permanentId } as never });
              await refreshDynamicEmployeeCode(tx, created.id);
              const after = await tx.employee.findUniqueOrThrow({ where: { id: created.id }, include: employeeInclude });
              await audit(
                { actorId: session.userId, email: session.email, role: session.role, module: "EMPLOYEE", recordType: "Employee", recordId: created.id, action: "IMPORTED", newValue: after, metadata: { batchId } },
                tx,
              );
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );
        } else {
          await db.$transaction(async (tx) => {
            const computed = deriveAssetComputedFields({}, { ...(data as Record<string, unknown>), status: "AVAILABLE" });
            const created = await tx.fixedAsset.create({
              data: { ...(data as Record<string, unknown>), status: "AVAILABLE", ...computed, qr: { create: {} } } as never,
              include: assetInclude,
            });
            await audit(
              { actorId: session.userId, email: session.email, role: session.role, module: "ASSET", recordType: "FixedAsset", recordId: created.id, action: "IMPORTED", newValue: created, metadata: { batchId } },
              tx,
            );
          });
        }
        imported += 1;
      } catch (error) {
        failures.push({
          rowNumber: __rowNumber,
          message:
            error instanceof AppError
              ? error.message
              : "This row could not be saved — it may duplicate a record added after validation. Re-validate the file and import again.",
        });
      }
    }

    const finalStatus = imported > 0 ? "IMPORTED" : "FAILED";
    await db.importBatch.update({ where: { id: batchId }, data: { status: finalStatus } });
    if (failures.length) {
      await db.importError.createMany({
        data: failures.map((failure) => ({ batchId, rowNumber: Number(failure.rowNumber) || 0, message: `Import failed: ${failure.message}` })),
      });
    }

    await audit({
      actorId: session.userId,
      email: session.email,
      role: session.role,
      module: "IMPORT",
      recordType: "ImportBatch",
      recordId: batchId,
      action: "IMPORTED",
      metadata: { type: batch.type, imported, failed: failures.length },
    });

    return NextResponse.json({ data: { batchId, imported, failed: failures.length, failures } });
  } catch (error) {
    return apiError(error, "Unable to import this batch");
  }
}
