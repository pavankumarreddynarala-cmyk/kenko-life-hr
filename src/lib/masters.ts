import { db } from "@/lib/db";

export const masterDefinitions = {
  company: { label: "Companies", delegate: db.company },
  location: { label: "Locations", delegate: db.location },
  city: { label: "Cities", delegate: db.city },
  branch: { label: "Branches", delegate: db.branch },
  outletModel: { label: "Outlet Models", delegate: db.outletModel },
  specialBranchCode: { label: "Special / Area Codes", delegate: db.specialBranchCode },
  department: { label: "Departments", delegate: db.department },
  employeeRole: { label: "Employee Roles", delegate: db.employeeRole },
  designation: { label: "Designations", delegate: db.designation },
  costCentre: { label: "Cost Centres", delegate: db.costCentre },
} as const;

export type MasterType = keyof typeof masterDefinitions;

export function isMasterType(type: string): type is MasterType {
  return Object.prototype.hasOwnProperty.call(masterDefinitions, type);
}

// Singular display name used in messages ("Location", "Special / Area Code").
export const masterSingular: Record<MasterType, string> = {
  company: "Company",
  location: "Location",
  city: "City",
  branch: "Branch",
  outletModel: "Outlet Model",
  specialBranchCode: "Special / Area Code",
  department: "Department",
  employeeRole: "Employee Role",
  designation: "Designation",
  costCentre: "Cost Centre",
};

// Every relation that points at a master row. Foreign keys on these tables are
// ON DELETE SET NULL, so deleting a master that is in use would silently blank the field on
// those employees/assets — usage is therefore checked in code before any delete.
export const masterUsage: Record<MasterType, Record<string, string>> = {
  company: { employees: "employee(s)", assets: "asset(s)" },
  location: { employees: "employee(s)", assets: "asset(s)" },
  city: { branches: "branch(es)", employees: "employee(s)" },
  branch: { employees: "employee(s)", specialCodes: "special / area code(s)" },
  outletModel: { employees: "employee(s)" },
  specialBranchCode: { employees: "employee(s)" },
  department: { employees: "employee(s)", assets: "asset(s)" },
  employeeRole: { employees: "employee(s)" },
  designation: { employees: "employee(s)" },
  costCentre: { employees: "employee(s)", assets: "asset(s)" },
};

export function usageCountSelect(type: MasterType) {
  return { _count: { select: Object.fromEntries(Object.keys(masterUsage[type]).map((key) => [key, true])) } };
}

/** "3 employee(s) and 2 asset(s)" from a Prisma `_count` object, or "" when unused. */
export function describeUsage(type: MasterType, counts: Record<string, number> | undefined) {
  if (!counts) return "";
  const parts = Object.entries(masterUsage[type])
    .filter(([key]) => (counts[key] ?? 0) > 0)
    .map(([key, label]) => `${counts[key]} ${label}`);
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// The masters whose CODE is part of an employee's derived Organisation Code.
export const dynamicCodeRelation: Partial<Record<MasterType, "cityId" | "outletModelId" | "specialBranchCodeId" | "departmentId" | "employeeRoleId">> = {
  city: "cityId",
  outletModel: "outletModelId",
  specialBranchCode: "specialBranchCodeId",
  department: "departmentId",
  employeeRole: "employeeRoleId",
};
