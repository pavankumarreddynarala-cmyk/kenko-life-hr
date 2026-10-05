import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MANAGEMENT_ROLES, PRIVILEGED_ROLES, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError, validationError } from "@/lib/api-error";
import { forbidden, notFound } from "@/lib/app-error";
import { bankFieldsIn, vendorPatchSchema } from "@/lib/vendors";
import { auditVendorChange, publicVendor, toVendorData } from "@/lib/vendor-service";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    requireRole(req, MANAGEMENT_ROLES);
    const vendor = await db.vendor.findUnique({ where: { id: (await params).id } });
    if (!vendor) throw notFound("The vendor");
    return NextResponse.json({ data: publicVendor(vendor) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Loading the vendor");
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const raw = (await req.json()) as Record<string, unknown>;
    const parsed = vendorPatchSchema.safeParse(raw);
    if (!parsed.success) return validationError(parsed.error);
    const vendor = await db.vendor.findUnique({ where: { id: (await params).id } });
    if (!vendor) throw notFound("The vendor");

    const data = toVendorData(parsed.data, raw);
    // R15: bank details are changed by an admin only. The server enforces it, not just the screen.
    const touchingBank = bankFieldsIn(data).filter((key) => (vendor as Record<string, unknown>)[key] !== data[key]);
    if (touchingBank.length && !(PRIVILEGED_ROLES as string[]).includes(session.role)) {
      throw forbidden("Only an Admin, CEO or COO can change a vendor's bank details. Ask one of them to make this change.");
    }
    const active = typeof raw.active === "boolean" ? raw.active : undefined;
    const activeChanged = active !== undefined && active !== vendor.active;

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.vendor.update({ where: { id: vendor.id }, data: { ...data, ...(activeChanged ? { active } : {}) } });
      await auditVendorChange(tx, vendor, data, { actorId: session.userId, email: session.email, role: session.role }, "ADMIN");
      if (activeChanged) {
        await audit({ actorId: session.userId, email: session.email, role: session.role, module: "VENDOR", recordType: "Vendor", recordId: vendor.id, action: active ? "ACTIVATED" : "DEACTIVATED", metadata: { vendorEmail: vendor.email } }, tx);
      }
      return row;
    });
    return NextResponse.json({ data: publicVendor(updated) });
  } catch (error) {
    return apiError(error, "Saving the vendor");
  }
}
