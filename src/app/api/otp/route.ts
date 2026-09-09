import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendOtp } from "@/lib/otp";
import { phoneSchema } from "@/lib/validators";
import { audit } from "@/lib/audit";
import { otpErrorResponse } from "@/lib/otp-response";
import { requireDatabaseConfiguration, requireOtpProviderConfiguration } from "@/lib/runtime-config";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = phoneSchema.safeParse(body.phone);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message, code: "INVALID_PHONE" },
        { status: 400 },
      );
    }

    requireDatabaseConfiguration();
    const provider = requireOtpProviderConfiguration();
    const phone = parsed.data;
    const requestIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const recent = await db.employeeOtp.count({
      where: {
        createdAt: { gt: new Date(Date.now() - 60_000) },
        OR: [{ phone }, { requestIp }],
      },
    });
    if (recent >= 3) {
      return NextResponse.json(
        { error: "Please wait before requesting another OTP.", code: "OTP_RATE_LIMITED" },
        { status: 429 },
      );
    }

    await sendOtp(phone, requestIp);
    if (provider !== "development") {
      await db.employeeOtp.create({
        data: {
          phone,
          codeHash: "external-provider",
          expiresAt: new Date(Date.now() + 10 * 60_000),
          requestIp,
        },
      });
    }
    await audit({
      actorId: phone,
      module: "AUTH",
      recordType: "EmployeePhone",
      recordId: phone,
      action: "OTP_REQUESTED",
      metadata: { provider },
    });
    return NextResponse.json({
      message:
        provider === "development"
          ? "Development OTP created. Enter the DEV_OTP value configured on the server."
          : "OTP sent to your mobile number.",
      phone,
      provider,
    });
  } catch (error) {
    return otpErrorResponse(error, "Unable to send OTP. Please try again or contact an administrator.");
  }
}
