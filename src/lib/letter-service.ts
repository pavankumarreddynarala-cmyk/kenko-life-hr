import { db } from "@/lib/db";

const include = { department: true, designation: true, employeeRole: true, company: true, city: true } as const;

/** Looks an employee up by Employee ID or by (work or personal) email. */
export async function findEmployeeForLetter(query: string) {
  const q = query.trim();
  if (q.includes("@")) {
    const email = q.toLowerCase();
    return db.employee.findFirst({ where: { deletedAt: null, OR: [{ email }, { personalEmail: email }] }, include });
  }
  return db.employee.findFirst({ where: { deletedAt: null, permanentId: q.toUpperCase() }, include });
}

export const TEMPLATE_SELECT = { id: true, name: true, letterType: true, fileName: true, fields: true, version: true, active: true, uploadedByEmail: true, createdAt: true, updatedAt: true } as const;
