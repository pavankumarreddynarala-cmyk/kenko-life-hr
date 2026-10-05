import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { Prisma } from "@prisma/client";
import { apiError } from "@/lib/api-error";
import { employeeInclude, exitDateProblem, refreshDynamicEmployeeCode } from "@/lib/employees";
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
      if (parsed.data.companyId && parsed.data.companyId !== before.companyId) {
        const company = await tx.company.findUnique({ where: { id: parsed.data.companyId }, select: { active: true } });
        if (!company?.active) throw new Error("VALIDATION:Select an active company");
      }
      const status = parsed.data.status ?? before.status;
      const joiningDate = parsed.data.joiningDate ?? before.joiningDate;
      const exitDate = parsed.data.exitDate ?? (status === "EXITED" ? before.exitDate : null);
      const problem = exitDateProblem(status, joiningDate, exitDate);
      if (problem) throw new Error(`VALIDATION:${problem}`);
      // Last working day only exists for exited employees; clear it if status moves back.
      await tx.employee.update({ where: { id }, data: { ...parsed.data, exitDate: status === "EXITED" ? exitDate : null } });
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
    if (error instanceof Error && ["UNAUTHENTICATED", "FORBIDDEN"].includes(error.message)) return apiError(error, "");
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Another employee already uses this mobile, email, PAN or Aadhaar" }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Unable to update employee";
    if (message.startsWith("VALIDATION:")) return NextResponse.json({ error: message.slice(11) }, { status: 400 });
    return NextResponse.json({ error: message }, { status: message === "Employee not found" ? 404 : 409 });
  }
}
