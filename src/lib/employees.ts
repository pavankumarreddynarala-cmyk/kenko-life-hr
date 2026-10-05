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

// Slimmer shape for list screens: only the fields the tables display (R3).
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
 * R4: the next Employee Code is the highest existing number in Employee Master plus one
 * (deleted employees included, so a number is never reused). Must run inside a transaction:
 * the advisory lock serialises concurrent additions so two requests can never receive the
 * same number; it is released when the transaction ends.
 */
export async function allocateEmployeeCode(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${EMPLOYEE_CODE_LOCK})`;
  const [row] = await tx.$queryRaw<Array<{ value: bigint }>>`
    SELECT COALESCE(MAX(CAST(substring("permanentId" from '[0-9]+$') AS BIGINT)), 0) + 1 AS value FROM "Employee"`;
  return `EMP${String(row.value).padStart(4, "0")}`;
}

/** R10: Last working day is mandatory when status is EXITED and cannot precede the joining date. */
export function exitDateProblem(
  status: string | undefined,
  joiningDate: Date | null | undefined,
  exitDate: Date | null | undefined,
): FieldIssue | null {
  if (status !== "EXITED") return null;
  if (!exitDate) return { field: "exitDate", label: fieldLabel("exitDate"), message: "Enter the last working day — it is required when the status is Exit." };
  if (joiningDate && exitDate < joiningDate) {
    return { field: "exitDate", label: fieldLabel("exitDate"), message: "The last working day cannot be earlier than the joining date." };
  }
  return null;
}

/** An inactive company cannot be chosen for a new or changed assignment (R9). */
export async function assertCompanyActive(tx: Prisma.TransactionClient, companyId: string | undefined | null) {
  if (!companyId) return;
  const company = await tx.company.findUnique({ where: { id: companyId }, select: { active: true, name: true } });
  if (!company || !company.active) {
    throw new AppError("The selected company is not active. Choose an active company, or reactivate it in Master Data.", {
      status: 400,
      code: "VALIDATION_ERROR",
      fields: [{ field: "companyId", label: fieldLabel("companyId"), message: "Choose an active company." }],
    });
  }
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
