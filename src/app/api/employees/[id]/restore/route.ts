import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { employeeInclude } from "@/lib/employees";
import { apiError } from "@/lib/api-error";
import { AppError, notFound } from "@/lib/app-error";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const { id } = await params;

    const employee = await db.$transaction(async (tx) => {
      const before = await tx.employee.findUnique({ where: { id }, include: employeeInclude });
      if (!before) throw notFound("This employee");
      if (!before.deletedAt) {
        throw new AppError(`${before.permanentId} (${before.name}) is not deleted, so there is nothing to restore.`, {
          status: 409,
          code: "NOT_DELETED",
        });
      }
      const after = await tx.employee.update({
        where: { id },
        data: { deletedAt: null, deletedById: null, deletedByEmail: null, deleteReason: null },
      });
      await tx.employeeHistory.create({
        data: { employeeId: id, snapshot: before as never, reason: "Employee restored" },
      });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "EMPLOYEE",
          recordType: "Employee",
          recordId: id,
          action: "RESTORED",
          previousValue: before,
          newValue: after,
        },
        tx,
      );
      return after;
    });
    return NextResponse.json({ data: employee });
  } catch (error) {
    return apiError(error, "Restoring the employee");
  }
}
