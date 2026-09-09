import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signPhoneVerification, signSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { verifyOtp } from "@/lib/otp";
import { phoneSchema } from "@/lib/validators";
import { otpErrorResponse } from "@/lib/otp-response";
import { requireDatabaseConfiguration, requireOtpProviderConfiguration } from "@/lib/runtime-config";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsedPhone = phoneSchema.safeParse(body.phone);
    if (!parsedPhone.success || !/^\d{4,8}$/.test(String(body.otp ?? ""))) {
      return NextResponse.json(
        { error: "Enter a valid Indian mobile number and OTP.", code: "INVALID_OTP_INPUT" },
        { status: 400 },
      );
    }

    requireDatabaseConfiguration();
    requireOtpProviderConfiguration();
    const phone = parsedPhone.data;
    if (!(await verifyOtp(phone, String(body.otp)))) {
      await audit({
        actorId: phone,
        module: "AUTH",
        recordType: "EmployeePhone",
        recordId: phone,
        action: "OTP_FAILED",
      });
      return NextResponse.json(
        { error: "Invalid or expired OTP.", code: "OTP_INVALID_OR_EXPIRED" },
        { status: 401 },
      );
    }

    const employee = await db.employee.findUnique({ where: { phone }, include: { user: true } });
    const response = NextResponse.json({
      isNew: !employee,
      phone,
      employee: employee
        ? { id: employee.id, permanentId: employee.permanentId, name: employee.name }
        : null,
    });
    response.cookies.set("kenko_phone_verified", signPhoneVerification(phone), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 15 * 60,
      path: "/",
    });
    if (employee) {
      response.cookies.set(
        "kenko_session",
        signSession({
          userId: employee.user?.id ?? employee.id,
          email: employee.email ?? phone,
          role: "EMPLOYEE",
          employeeId: employee.id,
        }),
        {
          httpOnly: true,
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production",
          maxAge: 8 * 60 * 60,
          path: "/",
        },
      );
    }
    await audit({
      actorId: employee?.id ?? phone,
      email: employee?.email ?? undefined,
      role: employee ? "EMPLOYEE" : undefined,
      module: "AUTH",
      recordType: "EmployeePhone",
      recordId: phone,
      action: "OTP_VERIFIED",
    });
    return response;
  } catch (error) {
    return otpErrorResponse(error, "Unable to verify OTP. Please try again or contact an administrator.");
  }
}
