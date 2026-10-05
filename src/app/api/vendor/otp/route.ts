import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendOtp } from "@/lib/otp";
import { audit } from "@/lib/audit";
import { otpErrorResponse } from "@/lib/otp-response";
import { requireDatabaseConfiguration, requireOtpProviderConfiguration } from "@/lib/runtime-config";
import { AppError } from "@/lib/app-error";
import { apiError } from "@/lib/api-error";
import { vendorForOtp } from "@/lib/vendor-lookup";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    requireDatabaseConfiguration();
    const provider = requireOtpProviderConfiguration();
    const vendor = await vendorForOtp(body);
    const message = "If this email is registered with The Kenko Life, a one-time code has been sent to it.";
    if (!vendor) return NextResponse.json({ message });

    const requestIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    const recent = await db.employeeOtp.count({ where: { createdAt: { gt: new Date(Date.now() - 60_000) }, OR: [{ email: vendor.email }, { requestIp }] } });
    if (recent >= 3) throw new AppError("Please wait a minute before asking for another code.", { status: 429, code: "OTP_RATE_LIMITED" });

    await sendOtp(vendor.email, requestIp);
    if (provider !== "development") {
      await db.employeeOtp.create({ data: { email: vendor.email, codeHash: "external-provider", expiresAt: new Date(Date.now() + 10 * 60_000), requestIp } });
    }
    await audit({ actorId: vendor.id, email: vendor.email, module: "AUTH", recordType: "Vendor", recordId: vendor.id, action: "OTP_REQUESTED", metadata: { provider } });
    return NextResponse.json({ message });
  } catch (error) {
    if (error instanceof AppError) return apiError(error, "Sending the code");
    return otpErrorResponse(error, "Unable to send the code. Please try again or contact The Kenko Life.");
  }
}
