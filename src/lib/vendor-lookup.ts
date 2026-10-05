import { db } from "@/lib/db";
import { AppError } from "@/lib/app-error";
import { hashToken } from "@/lib/vendors";

/**
 * Finds the vendor a one-time code is for. Through the invitation link the link itself proves
 * who it is for; on the sign-in page only vendors who have already submitted can sign in.
 * Returns null (not an error) for an unknown email so the page cannot be used to probe who is a vendor.
 */
export async function vendorForOtp(input: { token?: unknown; email?: unknown }) {
  if (typeof input.token === "string" && input.token) {
    const vendor = await db.vendor.findUnique({ where: { inviteTokenHash: hashToken(input.token) } });
    if (!vendor || vendor.status !== "INVITED" || !vendor.active) throw new AppError("This link is not valid any more. Ask The Kenko Life for a new one.", { status: 404, code: "INVITE_INVALID" });
    if (!vendor.inviteExpiresAt || vendor.inviteExpiresAt < new Date()) throw new AppError("This link has expired. Ask The Kenko Life to send you a new one.", { status: 410, code: "INVITE_EXPIRED" });
    return vendor;
  }
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!email) throw new AppError("Enter your email address.", { status: 400, code: "INVALID_EMAIL" });
  const vendor = await db.vendor.findUnique({ where: { email } });
  return vendor && vendor.status === "SUBMITTED" && vendor.active ? vendor : null;
}
