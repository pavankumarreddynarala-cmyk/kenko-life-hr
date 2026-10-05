import { Prisma } from "@prisma/client";
import { dynamicEmployeeCode } from "@/lib/ids";

export const employeeInclude = {
  company: true,
  location: true,
  city: true,
  branch: true,
  outletModel: true,
  specialBranchCode: true,
  department: true,
  employeeRole: true,
  designation: true,
  costCentre: true,
} satisfies Prisma.EmployeeInclude;

// Lightweight shape for list screens: only the fields the tables display.
const ref = { select: { id: true, name: true, code: true } } as const;
export const employeeListInclude = {
  company: ref,
  location: ref,
  city: ref,
  branch: ref,
  outletModel: ref,
  specialBranchCode: ref,
  department: ref,
  employeeRole: ref,
  designation: ref,
  costCentre: ref,
} satisfies Prisma.EmployeeInclude;

const EMPLOYEE_CODE_LOCK = 7_340_101;

/**
 * R4: the next Employee Code is the highest existing number in Employee Master plus one.
 * Must run inside a transaction: the advisory lock serialises concurrent additions so two
 * requests can never receive the same number (it is released when the transaction ends).
 */
export async function allocateEmployeeCode(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${EMPLOYEE_CODE_LOCK})`;
  const [row] = await tx.$queryRaw<Array<{ value: bigint }>>`
    SELECT COALESCE(MAX(CAST(substring("permanentId" from '[0-9]+$') AS BIGINT)), 0) + 1 AS value FROM "Employee"`;
  return `EMP${String(row.value).padStart(4, "0")}`;
}

/** R10: Last working day is mandatory when status is EXITED and cannot precede the joining date. */
export function exitDateProblem(status: string | undefined, joiningDate: Date | null | undefined, exitDate: Date | null | undefined) {
  if (status !== "EXITED") return null;
  if (!exitDate) return "Last working day is required when status is Exit";
  if (joiningDate && exitDate < joiningDate) return "Last working day cannot be earlier than the joining date";
  return null;
}

export async function refreshDynamicEmployeeCode(tx: Prisma.TransactionClient, employeeId: string) {
  const employee = await tx.employee.findUnique({
    where: { id: employeeId },
    include: {
      city: { select: { code: true } },
      outletModel: { select: { code: true } },
      specialBranchCode: { select: { code: true } },
      department: { select: { code: true } },
      employeeRole: { select: { code: true } },
    },
  });
  if (!employee) throw new Error("Employee not found");
  const dynamicId = dynamicEmployeeCode({
    cityCode: employee.city?.code,
    outletModelCode: employee.outletModel?.code,
    specialCode: employee.specialBranchCode?.code,
    numberOfOutlets: employee.numberOfOutlets,
    departmentCode: employee.department?.code,
    employeeRoleCode: employee.employeeRole?.code,
    employeeCode: employee.permanentId,
  });
  return tx.employee.update({ where: { id: employeeId }, data: { dynamicId } });
}
