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
