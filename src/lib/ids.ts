export type EmployeeCodeParts = {
  cityCode?: string | null;
  outletModelCode?: string | null;
  specialCode?: string | null;
  numberOfOutlets?: number | null;
  departmentCode?: string | null;
  employeeRoleCode?: string | null;
  employeeCode: string;
};

function segment(value: string | number | null | undefined) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function employeeCodeSuffix(employeeCode: string) {
  const numeric = employeeCode.match(/(\d+)$/)?.[1];
  return numeric ? numeric.padStart(4, "0") : segment(employeeCode);
}

export function dynamicEmployeeCode(parts: EmployeeCodeParts) {
  const values = [
    parts.cityCode,
    parts.outletModelCode,
    parts.specialCode,
    parts.numberOfOutlets,
    parts.departmentCode,
    parts.employeeRoleCode,
  ];
  if (values.some((value) => value === null || value === undefined || value === "")) return null;
  return [...values.map(segment), employeeCodeSuffix(parts.employeeCode)].join("-");
}
