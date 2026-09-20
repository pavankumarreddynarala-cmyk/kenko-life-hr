import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendOtp } from "@/lib/otp";
import { emailSchema } from "@/lib/validators";
import { audit } from "@/lib/audit";
import { otpErrorResponse } from "@/lib/otp-response";
import { requireDatabaseConfiguration, requireOtpProviderConfiguration } from "@/lib/runtime-config";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = emailSchema.safeParse(body.email);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message, code: "INVALID_EMAIL" },
        { status: 400 },
      );
    }

    requireDatabaseConfiguration();
    const provider = requireOtpProviderConfiguration();
    const email = parsed.data;
    const requestIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const recent = await db.employeeOtp.count({
      where: {
        createdAt: { gt: new Date(Date.now() - 60_000) },
        OR: [{ email }, { requestIp }],
      },
    });
    if (recent >= 3) {
      return NextResponse.json(
        { error: "Please wait before requesting another OTP.", code: "OTP_RATE_LIMITED" },
        { status: 429 },
      );
    }

    await sendOtp(email, requestIp);
    if (provider !== "development") {
      await db.employeeOtp.create({
        data: {
          email,
          codeHash: "external-provider",
          expiresAt: new Date(Date.now() + 10 * 60_000),
          requestIp,
        },
      });
    }
    await audit({
      actorId: email,
      module: "AUTH",
      recordType: "EmployeeEmail",
      recordId: email,
      action: "OTP_REQUESTED",
      metadata: { provider },
    });
    return NextResponse.json({
      message:
        provider === "development"
          ? "Development OTP created. Enter the DEV_OTP value configured on the server."
          : "OTP sent to your email address.",
      email,
      provider,
    });
  } catch (error) {
    return otpErrorResponse(error, "Unable to send OTP. Please try again or contact an administrator.");
  }
}
