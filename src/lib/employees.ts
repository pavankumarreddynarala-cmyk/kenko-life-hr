import { Prisma } from "@prisma/client";
import { dynamicEmployeeCode } from "@/lib/ids";
import { AppError, type FieldIssue } from "@/lib/app-error";
import { fieldLabel } from "@/lib/field-labels";

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

/**
 * Next auto-generated Employee Code (EMP0001, EMP0002, …). An Admin may hand-edit a code
 * to a value the sequence has not reached yet, so skip any number that is already taken
 * instead of failing the create with a unique-constraint error.
 */
export async function allocateEmployeeCode(tx: Prisma.TransactionClient) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [row] = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('employee_code_seq') AS value`;
    const code = `EMP${String(row.value).padStart(4, "0")}`;
    const taken = await tx.employee.findUnique({ where: { permanentId: code }, select: { id: true } });
    if (!taken) return code;
  }
  throw new AppError(
    "The system could not find a free Employee Code. Contact an administrator so the Employee Code sequence can be checked.",
    { status: 500, code: "EMPLOYEE_CODE_EXHAUSTED" },
  );
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
  if (!employee) throw new AppError("The employee could not be found. Refresh the page and try again.", { status: 404, code: "NOT_FOUND" });
  const dynamicId = dynamicEmployeeCode({
    cityCode: employee.city?.code,
    outletModelCode: employee.outletModel?.code,
    specialCode: employee.specialBranchCode?.code,
    numberOfOutlets: employee.numberOfOutlets,
    departmentCode: employee.department?.code,
    employeeRoleCode: employee.employeeRole?.code,
    employeeCode: employee.permanentId,
  });
  if (dynamicId) {
    const clash = await tx.employee.findFirst({
      where: { dynamicId, NOT: { id: employeeId } },
      select: { permanentId: true, name: true },
    });
    if (clash) {
      throw new AppError(
        `The Organisation Code ${dynamicId} would duplicate the one already held by ${clash.permanentId} (${clash.name}). Organisation Codes must be unique — change the Employee Code or one of the organisation fields so the two differ.`,
        {
          status: 409,
          code: "DUPLICATE_VALUE",
          fields: [{ field: "permanentId", label: fieldLabel("permanentId"), message: "This Employee Code produces an Organisation Code that is already taken." }],
        },
      );
    }
  }
  return tx.employee.update({ where: { id: employeeId }, data: { dynamicId } });
}

/** Re-derives the Organisation Code of every employee that uses the given master value. */
export async function refreshDynamicCodesFor(
  tx: Prisma.TransactionClient,
  relation: "cityId" | "outletModelId" | "specialBranchCodeId" | "departmentId" | "employeeRoleId",
  masterId: string,
) {
  const employees = await tx.employee.findMany({ where: { [relation]: masterId }, select: { id: true } });
  for (const employee of employees) await refreshDynamicEmployeeCode(tx, employee.id);
  return employees.length;
}

type UniqueCandidate = {
  permanentId?: string | null;
  phone?: string | null;
  email?: string | null;
  personalEmail?: string | null;
  pan?: string | null;
  aadhaar?: string | null;
};

const UNIQUE_FIELDS = ["permanentId", "phone", "email", "personalEmail", "pan", "aadhaar"] as const;

/**
 * Rejects values that another employee already holds — including soft-deleted ones —
 * and names the holder, so the user knows whether to pick a different value or restore
 * the existing record instead.
 */
export async function assertEmployeeUnique(
  tx: Prisma.TransactionClient,
  values: UniqueCandidate,
  excludeId?: string,
) {
  const issues: FieldIssue[] = [];
  for (const field of UNIQUE_FIELDS) {
    const value = values[field];
    if (!value) continue;
    const holder = await tx.employee.findFirst({
      where: {
        ...(field === "email" || field === "personalEmail"
          ? { [field]: { equals: value, mode: "insensitive" as const } }
          : { [field]: value }),
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { permanentId: true, name: true, deletedAt: true },
    });
    if (!holder) continue;
    const label = fieldLabel(field);
    // For a duplicate Employee Code the code itself is already in the sentence, so name the person only.
    const who = `${field === "permanentId" ? holder.name : `${holder.permanentId} (${holder.name})`}${holder.deletedAt ? ", a deleted employee" : ""}`;
    issues.push({
      field,
      label,
      message:
        field === "permanentId"
          ? `${label} ${value} is already assigned to ${who}. Employee Codes must be unique — enter a different code.`
          : `${label} ${value} already belongs to ${who}. Enter a different ${label.toLowerCase()}${holder.deletedAt ? ", or restore that employee from the deleted list instead of creating a duplicate" : ", or edit the existing employee instead"}.`,
    });
  }
  if (issues.length) {
    throw new AppError(
      issues.length === 1 ? issues[0].message : `${issues.length} values are already in use. ${issues.map((issue) => issue.message).join(" ")}`,
      { status: 409, code: "DUPLICATE_VALUE", fields: issues },
    );
  }
}
