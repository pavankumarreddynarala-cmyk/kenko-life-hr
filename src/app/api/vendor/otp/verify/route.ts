import { NextRequest, NextResponse } from "next/server";
import { verifyOtp } from "@/lib/otp";
import { audit } from "@/lib/audit";
import { otpErrorResponse } from "@/lib/otp-response";
import { requireDatabaseConfiguration, requireOtpProviderConfiguration } from "@/lib/runtime-config";
import { AppError } from "@/lib/app-error";
import { apiError } from "@/lib/api-error";
import { vendorForOtp } from "@/lib/vendor-lookup";
import { setVendorCookie } from "@/lib/vendor-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!/^\d{4,8}$/.test(String(body.otp ?? ""))) throw new AppError("Enter the one-time code from your email.", { status: 400, code: "INVALID_OTP_INPUT" });
    requireDatabaseConfiguration();
    requireOtpProviderConfiguration();
    const vendor = await vendorForOtp(body);
    const invalid = new AppError("That code is wrong or has expired. Ask for a new code and try again.", { status: 401, code: "OTP_INVALID_OR_EXPIRED" });
    if (!vendor) throw invalid;
    if (!(await verifyOtp(vendor.email, String(body.otp)))) {
      await audit({ actorId: vendor.id, email: vendor.email, module: "AUTH", recordType: "Vendor", recordId: vendor.id, action: "OTP_FAILED" });
      throw invalid;
    }
    const response = NextResponse.json({ status: vendor.status, email: vendor.email });
    setVendorCookie(response, { vendorId: vendor.id, email: vendor.email });
    await audit({ actorId: vendor.id, email: vendor.email, module: "AUTH", recordType: "Vendor", recordId: vendor.id, action: "OTP_VERIFIED" });
    return response;
  } catch (error) {
    if (error instanceof AppError) return apiError(error, "Verifying the code");
    return otpErrorResponse(error, "Unable to verify the code. Please try again or contact The Kenko Life.");
  }
}
