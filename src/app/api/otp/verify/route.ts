import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setSessionCookie, signEmailVerification } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { verifyOtp } from "@/lib/otp";
import { emailSchema } from "@/lib/validators";
import { otpErrorResponse } from "@/lib/otp-response";
import { requireDatabaseConfiguration, requireOtpProviderConfiguration } from "@/lib/runtime-config";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsedEmail = emailSchema.safeParse(body.email);
    if (!parsedEmail.success || !/^\d{4,8}$/.test(String(body.otp ?? ""))) {
      return NextResponse.json(
        { error: "Enter a valid email address and OTP.", code: "INVALID_OTP_INPUT" },
        { status: 400 },
      );
    }

    requireDatabaseConfiguration();
    requireOtpProviderConfiguration();
    const email = parsedEmail.data;
    if (!(await verifyOtp(email, String(body.otp)))) {
      await audit({
        actorId: email,
        module: "AUTH",
        recordType: "EmployeeEmail",
        recordId: email,
        action: "OTP_FAILED",
      });
      return NextResponse.json(
        { error: "Invalid or expired OTP.", code: "OTP_INVALID_OR_EXPIRED" },
        { status: 401 },
      );
    }

    const employee = await db.employee.findUnique({ where: { email }, include: { user: true } });
    const response = NextResponse.json({
      isNew: !employee,
      email,
      employee: employee
        ? { id: employee.id, permanentId: employee.permanentId, name: employee.name }
        : null,
    });
    response.cookies.set("kenko_email_verified", signEmailVerification(email), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 15 * 60,
      path: "/",
    });
    if (employee && employee.deletedAt === null) {
      setSessionCookie(response, {
        userId: employee.user?.id ?? employee.id,
        email: employee.email ?? email,
        role: "EMPLOYEE",
        employeeId: employee.id,
      });
    }
    await audit({
      actorId: employee?.id ?? email,
      email: employee?.email ?? email,
      role: employee ? "EMPLOYEE" : undefined,
      module: "AUTH",
      recordType: "EmployeeEmail",
      recordId: email,
      action: "OTP_VERIFIED",
    });
    return response;
  } catch (error) {
    return otpErrorResponse(error, "Unable to verify OTP. Please try again or contact an administrator.");
  }
}
