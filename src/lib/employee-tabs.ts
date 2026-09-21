// The sections of the Employee Portal profile. Kept out of the client component so both
// the server route (which validates the URL) and the page itself can import it.
export const EMPLOYEE_TABS = [
  { key: "personal", label: "Personal details", href: "/employee" },
  { key: "employment", label: "Employment & master data", href: "/employee/employment" },
  { key: "bank", label: "Bank & statutory", href: "/employee/bank" },
  { key: "assets", label: "My assets", href: "/employee/assets" },
  { key: "requests", label: "My requests", href: "/employee/requests" },
] as const;

export type EmployeeTabKey = (typeof EMPLOYEE_TABS)[number]["key"];

export function isEmployeeTab(value: string): value is EmployeeTabKey {
  return EMPLOYEE_TABS.some((tab) => tab.key === value);
}
