import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireVendor } from "@/lib/vendor-auth";
import { audit } from "@/lib/audit";
import { apiError, validationError } from "@/lib/api-error";
import { AppError, forbidden } from "@/lib/app-error";
import { replyToAddress } from "@/lib/mail";
import { bankFieldsIn, vendorPatchSchema, vendorSubmitSchema } from "@/lib/vendors";
import { auditVendorChange, publicVendor, toVendorData } from "@/lib/vendor-service";

export const dynamic = "force-dynamic";

async function currentVendor(req: NextRequest) {
  const session = requireVendor(req);
  const vendor = await db.vendor.findUnique({ where: { id: session.vendorId } });
  if (!vendor || !vendor.active) throw new AppError("This vendor account is not available. Contact The Kenko Life.", { status: 403, code: "VENDOR_INACTIVE" });
  return vendor;
}

// What the vendor sees: exactly what is stored, including any change an admin has made.
export async function GET(req: NextRequest) {
  try {
    const vendor = await currentVendor(req);
    return NextResponse.json({ data: publicVendor(vendor), supportEmail: replyToAddress() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Loading your details");
  }
}

// First (and only) submission through the link. It locks the bank details.
export async function POST(req: NextRequest) {
  try {
    const vendor = await currentVendor(req);
    if (vendor.status !== "INVITED") throw new AppError("Your details were already submitted. You can view them, and edit everything except the bank details.", { status: 409, code: "ALREADY_SUBMITTED" });
    const parsed = vendorSubmitSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const updated = await db.$transaction(async (tx) => {
      const row = await tx.vendor.update({
        where: { id: vendor.id },
        data: { ...parsed.data, status: "SUBMITTED", submittedAt: new Date(), bankLocked: true, inviteTokenHash: null, inviteExpiresAt: null },
      });
      await audit({ actorId: vendor.id, email: vendor.email, module: "VENDOR", recordType: "Vendor", recordId: vendor.id, action: "SUBMITTED", newValue: parsed.data, metadata: { via: "VENDOR" } }, tx);
      return row;
    });
    return NextResponse.json({ data: publicVendor(updated) }, { status: 201 });
  } catch (error) {
    return apiError(error, "Submitting your details");
  }
}

// Later edits by the vendor: everything except the bank details.
export async function PATCH(req: NextRequest) {
  try {
    const vendor = await currentVendor(req);
    if (vendor.status !== "SUBMITTED") throw new AppError("Submit your details through the link first.", { status: 409, code: "NOT_SUBMITTED" });
    const raw = (await req.json()) as Record<string, unknown>;
    const parsed = vendorPatchSchema.safeParse(raw);
    if (!parsed.success) return validationError(parsed.error);
    const data = toVendorData(parsed.data, raw);
    const changedBank = bankFieldsIn(data).filter((key) => (vendor as Record<string, unknown>)[key] !== data[key]);
    if (changedBank.length) {
      throw forbidden(`Bank details cannot be changed after the first submission. To change them, write to ${replyToAddress()} and The Kenko Life will update them for you.`);
    }
    for (const key of bankFieldsIn(data)) delete data[key];
    const updated = await db.$transaction(async (tx) => {
      const row = await tx.vendor.update({ where: { id: vendor.id }, data });
      await auditVendorChange(tx, vendor, data, { actorId: vendor.id, email: vendor.email }, "VENDOR");
      return row;
    });
    return NextResponse.json({ data: publicVendor(updated) });
  } catch (error) {
    return apiError(error, "Saving your details");
  }
}
