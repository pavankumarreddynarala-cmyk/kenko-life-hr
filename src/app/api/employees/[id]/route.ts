import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { employeeInclude, refreshDynamicEmployeeCode } from "@/lib/employees";
import { employeeAdminSchema } from "@/lib/validators";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = requireRole(req, ["ADMIN", "HR"]);
    const { id } = await params;
    const parsed = employeeAdminSchema.partial().safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const employee = await db.$transaction(async (tx) => {
      const before = await tx.employee.findUnique({ where: { id }, include: employeeInclude });
      if (!before) throw new Error("Employee not found");
      await tx.employee.update({ where: { id }, data: parsed.data });
      await refreshDynamicEmployeeCode(tx, id);
      const after = await tx.employee.findUniqueOrThrow({ where: { id }, include: employeeInclude });
      await tx.employeeHistory.create({
        data: { employeeId: id, snapshot: before as never, reason: "Employee master update" },
      });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "EMPLOYEE",
          recordType: "Employee",
          recordId: id,
          action: "UPDATED",
          previousValue: before,
          newValue: after,
        },
        tx,
      );
      return after;
    });
    return NextResponse.json({ data: employee });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update employee";
    return NextResponse.json({ error: message }, { status: message === "Employee not found" ? 404 : 409 });
  }
}
