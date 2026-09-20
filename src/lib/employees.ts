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

export async function allocateEmployeeCode(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('employee_code_seq') AS value`;
  return `EMP${String(row.value).padStart(4, "0")}`;
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
