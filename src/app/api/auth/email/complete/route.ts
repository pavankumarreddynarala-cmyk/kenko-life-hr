import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { signEmailVerification, signSession } from "@/lib/auth";
import { employeeAuthErrorResponse } from "@/lib/auth-response";
import { db } from "@/lib/db";
import { getSupabaseUser } from "@/lib/email-auth";
import { findEmployeeIdByEmail } from "@/lib/employee-auth";
import { requireDatabaseConfiguration } from "@/lib/runtime-config";

const requestSchema = z.object({
  accessToken: z.string().min(20),
});

const cookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function POST(req: NextRequest) {
  try {
    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "The login link is incomplete. Request a new secure login email.", code: "INVALID_EMAIL_LINK" },
        { status: 400 },
      );
    }

    requireDatabaseConfiguration();
    const identity = await getSupabaseUser(parsed.data.accessToken);
    const employeeId = await findEmployeeIdByEmail(db, identity.email);
    const employee = employeeId
      ? await db.employee.findUnique({ where: { id: employeeId }, include: { user: true } })
      : null;
    const response = NextResponse.json({
      isNew: !employee,
      email: identity.email,
      employee: employee
        ? { id: employee.id, permanentId: employee.permanentId, name: employee.name }
        : null,
    });

    response.cookies.set(
      "kenko_email_verified",
      signEmailVerification(identity.email, identity.id),
      { ...cookieOptions, maxAge: 15 * 60 },
    );
    if (employee) {
      response.cookies.set(
        "kenko_session",
        signSession({
          userId: employee.user?.id ?? identity.id,
          email: identity.email,
          role: "EMPLOYEE",
          employeeId: employee.id,
        }),
        { ...cookieOptions, maxAge: 8 * 60 * 60 },
      );
    } else {
      response.cookies.delete("kenko_session");
    }
    await audit({
      actorId: employee?.id ?? identity.id,
      email: identity.email,
      role: employee ? "EMPLOYEE" : undefined,
      module: "AUTH",
      recordType: "EmployeeEmail",
      recordId: identity.email,
      action: "EMAIL_LINK_VERIFIED",
      metadata: { provider: "supabase", isNewEmployee: !employee },
    });
    return response;
  } catch (error) {
    return employeeAuthErrorResponse(
      error,
      "Unable to complete email sign-in. Request a new secure login email.",
    );
  }
}
