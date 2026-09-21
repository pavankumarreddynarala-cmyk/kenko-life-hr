// Client-safe (no server imports): shared by API guards and by the UI to hide actions the
// signed-in role cannot perform.

export type RoleName = "ADMIN" | "HR" | "CFO" | "EMPLOYEE" | "CEO" | "COO";

// Everyone who signs in through the Management portal.
export const MANAGEMENT_ROLE_NAMES: readonly RoleName[] = ["ADMIN", "CEO", "COO", "HR", "CFO"];

// Roles that may perform destructive / integrity-sensitive actions: editing an Employee
// Code, deleting or restoring assets, and deleting master data. HR and CFO keep full
// day-to-day access (create/edit/transfer/import/export) but not these.
export const PRIVILEGED_ROLE_NAMES: readonly RoleName[] = ["ADMIN", "CEO", "COO"];

export const ROLE_LABELS: Record<RoleName, string> = {
  ADMIN: "Admin",
  HR: "HR",
  CFO: "CFO",
  CEO: "CEO",
  COO: "COO",
  EMPLOYEE: "Employee",
};

export type Permissions = {
  editEmployeeCode: boolean;
  deleteAsset: boolean;
  restoreAsset: boolean;
  editMasterData: boolean;
  deleteMasterData: boolean;
};

export function isManagementRole(role: string): boolean {
  return (MANAGEMENT_ROLE_NAMES as readonly string[]).includes(role);
}

export function isPrivilegedRole(role: string): boolean {
  return (PRIVILEGED_ROLE_NAMES as readonly string[]).includes(role);
}

export function permissionsFor(role: string): Permissions {
  const privileged = isPrivilegedRole(role);
  return {
    editEmployeeCode: privileged,
    deleteAsset: privileged,
    restoreAsset: privileged,
    editMasterData: isManagementRole(role),
    deleteMasterData: privileged,
  };
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role as RoleName] ?? role;
}

/** Friendly display name for a management account that has no name stored yet. */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
