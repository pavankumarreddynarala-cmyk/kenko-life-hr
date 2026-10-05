import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { allocateEmployeeCode, employeeInclude, employeeListInclude, exitDateProblem, refreshDynamicEmployeeCode } from "@/lib/employees";
import { employeeAdminSchema } from "@/lib/validators";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    requireRole(req, ["ADMIN", "HR", "CFO"]);
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const data = await db.employee.findMany({
      where: q
        ? {
            OR: [
              { permanentId: { contains: q, mode: "insensitive" } },
              { dynamicId: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
            ],
          }
        : undefined,
      include: employeeListInclude,
      take: 5000,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error, "Unable to load employees");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireRole(req, ["ADMIN", "HR"]);
    const parsed = employeeAdminSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const problem = exitDateProblem(parsed.data.status, parsed.data.joiningDate, parsed.data.exitDate);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    if (parsed.data.status !== "EXITED") parsed.data.exitDate = undefined;

    if (parsed.data.companyId) {
      const company = await db.company.findUnique({ where: { id: parsed.data.companyId }, select: { active: true } });
      if (!company?.active) return NextResponse.json({ error: "Select an active company" }, { status: 400 });
    }

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
    );
    return NextResponse.json({ data: employee }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ["UNAUTHENTICATED", "FORBIDDEN"].includes(error.message)) return apiError(error, "");
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "An employee with this mobile, email, PAN or Aadhaar already exists" }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Unable to create employee";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
