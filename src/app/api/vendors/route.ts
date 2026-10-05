import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MANAGEMENT_ROLES, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError, validationError } from "@/lib/api-error";
import { AppError } from "@/lib/app-error";
import { hashToken, INVITE_DAYS, newInviteToken, vendorInviteSchema } from "@/lib/vendors";
import { publicVendor } from "@/lib/vendor-service";
import { mailConfigured, replyToAddress, sendMail } from "@/lib/mail";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    requireRole(req, MANAGEMENT_ROLES);
    const data = await db.vendor.findMany({ orderBy: { createdAt: "desc" }, take: 2000 });
    return NextResponse.json({ data: data.map(publicVendor) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Loading vendors");
  }
}

const inviteLink = (req: NextRequest, token: string) =>
  `${(process.env.APP_URL?.trim() || req.nextUrl.origin).replace(/\/+$/, "")}/vendor/apply/${token}`;

// Admin sends a link: creates the vendor record (or re-issues a link for one who has not submitted yet).
export async function POST(req: NextRequest) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const parsed = vendorInviteSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const { email, legalName } = parsed.data;

    const existing = await db.vendor.findUnique({ where: { email } });
    if (existing && existing.status === "SUBMITTED") {
      throw new AppError(`${email} has already submitted vendor details. Open the vendor in the list to view or edit them; a new link is not needed.`, { status: 409, code: "VENDOR_EXISTS" });
    }
    const token = newInviteToken();
    const data = {
      inviteTokenHash: hashToken(token),
      inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
      invitedByEmail: session.email,
      ...(legalName ? { legalName } : {}),
    };
    const vendor = existing
      ? await db.vendor.update({ where: { id: existing.id }, data })
      : await db.vendor.create({ data: { email, ...data } });
    await audit({ actorId: session.userId, email: session.email, role: session.role, module: "VENDOR", recordType: "Vendor", recordId: vendor.id, action: existing ? "INVITE_REISSUED" : "INVITED", newValue: { email, legalName } });

    const link = inviteLink(req, token);
    let emailed = false;
    let emailProblem: string | undefined;
    if (mailConfigured()) {
      try {
        await sendMail({
          to: email,
          subject: "Please share your vendor details with The Kenko Life",
          text: `Hello,\n\nThe Kenko Life would like to onboard you as a vendor. Please open the link below and fill in your business, tax and bank details. You will verify your email with a one-time code.\n\n${link}\n\nThe link is valid for ${INVITE_DAYS} days.\n\nReplies to this email reach ${replyToAddress()}.\n\nThe Kenko Life`,
        });
        emailed = true;
      } catch (error) {
        console.error("Vendor invitation email failed", error);
        emailProblem = "The email could not be sent. Copy the link and send it yourself.";
      }
    }
    return NextResponse.json({ data: publicVendor(vendor), link, emailed, emailProblem, emailConfigured: mailConfigured() }, { status: existing ? 200 : 201 });
  } catch (error) {
    return apiError(error, "Creating the vendor link");
  }
}
