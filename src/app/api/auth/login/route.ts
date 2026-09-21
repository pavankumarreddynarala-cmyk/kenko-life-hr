import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError, validationError } from "@/lib/api-error";
import { loginSchema } from "@/lib/validators";
import { isManagementRole } from "@/lib/permissions";

// Management portal sign-in (Admin, CEO, COO, HR, CFO). Employees sign in with an email OTP
// at /employee/login instead, so an EMPLOYEE account is refused here with a pointer to it.
export async function POST(req: NextRequest) {
  try {
    const parsed = loginSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const { email, password } = parsed.data;

    const user = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      await audit({ email, module: "AUTH", recordType: "User", recordId: email, action: "LOGIN_FAILED" });
      return NextResponse.json(
        {
          error:
            "The email or password is incorrect. Check for typing mistakes (passwords are case-sensitive) and try again. If you have forgotten your password, ask an Admin to reset it.",
          code: "INVALID_CREDENTIALS",
        },
        { status: 401 },
      );
    }
    if (!isManagementRole(user.role)) {
      return NextResponse.json(
        {
          error:
            "This is an employee account. Employees sign in with an email OTP on the Employee Portal — go to /employee/login instead.",
          code: "WRONG_PORTAL",
        },
        { status: 403 },
      );
    }

    const response = NextResponse.json({ role: user.role, redirectTo: "/dashboard" });
    setSessionCookie(response, {
      userId: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employeeId || undefined,
    });
    await audit({
      actorId: user.id,
      email: user.email,
      role: user.role,
      module: "AUTH",
      recordType: "User",
      recordId: user.id,
      action: "LOGIN_SUCCESS",
    });
    return response;
  } catch (error) {
    return apiError(error, "Sign-in");
  }
}
