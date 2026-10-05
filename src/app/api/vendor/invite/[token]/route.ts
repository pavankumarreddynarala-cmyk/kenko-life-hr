import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { hashToken } from "@/lib/vendors";

export const dynamic = "force-dynamic";

// Public: lets the link page show whose email the one-time code will go to.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const vendor = await db.vendor.findUnique({ where: { inviteTokenHash: hashToken((await params).token) } });
    if (!vendor || vendor.status !== "INVITED" || !vendor.active) {
      return NextResponse.json({ error: "This link is not valid any more. If you already submitted your details, sign in with your email instead. Otherwise ask The Kenko Life for a new link.", code: "INVITE_INVALID" }, { status: 404 });
    }
    if (!vendor.inviteExpiresAt || vendor.inviteExpiresAt < new Date()) {
      return NextResponse.json({ error: "This link has expired. Ask The Kenko Life to send you a new one.", code: "INVITE_EXPIRED" }, { status: 410 });
    }
    const [name, domain] = vendor.email.split("@");
    return NextResponse.json({ email: vendor.email, maskedEmail: `${name.slice(0, 2)}***@${domain}`, legalName: vendor.legalName });
  } catch (error) {
    return apiError(error, "Checking the vendor link");
  }
}
