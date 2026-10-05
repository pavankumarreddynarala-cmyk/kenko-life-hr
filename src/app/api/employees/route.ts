import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { allocateEmployeeCode, assertCompanyActive, assertEmployeeUnique, employeeInclude, employeeListInclude, exitDateProblem, refreshDynamicEmployeeCode } from "@/lib/employees";
import { employeeAdminSchema } from "@/lib/validators";
import { apiError, validationError } from "@/lib/api-error";
import { AppError } from "@/lib/app-error";

export async function GET(req: NextRequest) {
  try {
    requireRole(req, MANAGEMENT_ROLES);
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    // Default view is active employees only. ?deleted=1 lists soft-deleted employees
    // (for the Employee Master's deletion history and the Restore action).
    const wantDeleted = req.nextUrl.searchParams.get("deleted") === "1";
    const data = await db.employee.findMany({
      where: {
        deletedAt: wantDeleted ? { not: null } : null,
        ...(q
          ? {
              OR: [
                { permanentId: { contains: q, mode: "insensitive" } },
                { dynamicId: { contains: q, mode: "insensitive" } },
                { teamOfficeCode: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      },
      include: employeeListInclude,
      take: 5000,
      orderBy: wantDeleted ? { deletedAt: "desc" } : { createdAt: "desc" },
    });
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error, "Loading employees");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const parsed = employeeAdminSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);

    const problem = exitDateProblem(parsed.data.status, parsed.data.joiningDate, parsed.data.exitDate);
    if (problem) throw new AppError(problem.message, { status: 400, code: "VALIDATION_ERROR", fields: [problem] });
    // Last working day only exists for exited employees.
    if (parsed.data.status !== "EXITED") parsed.data.exitDate = undefined;

    const employee = await db.$transaction(
      async (tx) => {
        await assertCompanyActive(tx, parsed.data.companyId);
        await assertEmployeeUnique(tx, parsed.data);
        // The Employee Code is always generated here; an Admin can edit it afterwards.
        const permanentId = await allocateEmployeeCode(tx);
        const created = await tx.employee.create({ data: { ...parsed.data, permanentId } });
        const coded = await refreshDynamicEmployeeCode(tx, created.id);
        await audit(
          {
            actorId: session.userId,
            email: session.email,
            role: session.role,
            module: "EMPLOYEE",
            recordType: "Employee",
            recordId: created.id,
            action: "CREATED",
            newValue: { ...parsed.data, permanentId, dynamicId: coded.dynamicId },
          },
          tx,
        );
        return tx.employee.findUniqueOrThrow({ where: { id: created.id }, include: employeeInclude });
      },
    );
    return NextResponse.json({ data: employee }, { status: 201 });
  } catch (error) {
    return apiError(error, "Adding the employee");
  }
}
