import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { forbidden } from "@/lib/app-error";
import { SOP_LIST_SELECT, sopVisibleTo } from "@/lib/sops";

export const dynamic = "force-dynamic";

// Only the documents tagged to the signed-in employee's division or role (or to everyone).
export async function GET(req: NextRequest) {
  try {
    const session = requireRole(req, ["EMPLOYEE"]);
    if (!session.employeeId) throw forbidden("Your account is not linked to an employee record.");
    const employee = await db.employee.findUnique({ where: { id: session.employeeId }, select: { departmentId: true, employeeRoleId: true, deletedAt: true } });
    if (!employee || employee.deletedAt) throw forbidden("Your employee record is not active.");
    const all = await db.sopDocument.findMany({ select: SOP_LIST_SELECT, orderBy: { title: "asc" } });
    const data = all.filter((sop) => sopVisibleTo(sop, employee)).map(({ audience, departmentIds, roleIds, uploadedByEmail, ...visible }) => {
      void audience; void departmentIds; void roleIds; void uploadedByEmail;
      return visible;
    });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Loading your SOPs");
  }
}
