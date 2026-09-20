import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { employeeInclude } from "@/lib/employees";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const { id } = await params;

    const employee = await db.$transaction(async (tx) => {
      const before = await tx.employee.findUnique({ where: { id }, include: employeeInclude });
      if (!before) throw new Error("Employee not found");
      if (!before.deletedAt) throw new Error("Employee is not deleted");
      const after = await tx.employee.update({ where: { id }, data: { deletedAt: null } });
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
    const message = error instanceof Error ? error.message : "Unable to restore employee";
    return NextResponse.json({ error: message }, { status: message === "Employee not found" ? 404 : 409 });
  }
}
