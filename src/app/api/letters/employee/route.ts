import { NextRequest, NextResponse } from "next/server";
import { DOCUMENT_ROLES, requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { AppError } from "@/lib/app-error";
import { employeeLetterValues } from "@/lib/letters";
import { findEmployeeForLetter } from "@/lib/letter-service";

export const dynamic = "force-dynamic";

// Employee ID (EMP0042) or email -> the values that fill the letter's standard fields.
export async function GET(req: NextRequest) {
  try {
    requireRole(req, DOCUMENT_ROLES, "Only an Admin, CEO, COO or HR can generate letters.");
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    if (!q) throw new AppError("Enter an Employee ID (for example EMP0042) or an email address.", { status: 400, code: "VALIDATION_ERROR", fields: [{ field: "employee", message: "Enter an Employee ID or email." }] });
    const employee = await findEmployeeForLetter(q);
    if (!employee) throw new AppError(`No employee was found for “${q}”. Check the Employee ID or email in the Employee Master.`, { status: 404, code: "NOT_FOUND", fields: [{ field: "employee", message: "No employee found." }] });
    return NextResponse.json({
      employee: { id: employee.id, code: employee.permanentId, name: employee.name, email: employee.personalEmail || employee.email, status: employee.status },
      values: employeeLetterValues(employee),
    });
  } catch (error) {
    return apiError(error, "Looking up the employee");
  }
}
