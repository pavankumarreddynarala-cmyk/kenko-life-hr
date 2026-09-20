import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { allocateEmployeeCode, employeeInclude, refreshDynamicEmployeeCode } from "@/lib/employees";
import { employeeAdminSchema } from "@/lib/validators";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    requireRole(req, MANAGEMENT_ROLES);
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    // Default view is active employees only. ?deleted=1 lists soft-deleted employees
    // (for the Employee Master's "Deleted" view and the Restore action).
    const wantDeleted = req.nextUrl.searchParams.get("deleted") === "1";
    const data = await db.employee.findMany({
      where: {
        deletedAt: wantDeleted ? { not: null } : null,
        ...(q
          ? {
              OR: [
                { permanentId: { contains: q, mode: "insensitive" } },
                { dynamicId: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      },
      include: employeeInclude,
      take: 500,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error, "Unable to load employees");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const parsed = employeeAdminSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const employee = await db.$transaction(
      async (tx) => {
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
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.json({ data: employee }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create employee";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
