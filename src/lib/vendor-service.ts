import type { Vendor } from "@prisma/client";
import { audit } from "@/lib/audit";
import { changedFields } from "@/lib/vendors";
import { VENDOR_BANK_KEYS, VENDOR_FIELDS } from "@/lib/vendor-fields";
import type { Prisma } from "@prisma/client";

/** Never leaves the server: the hash of the invitation token. */
export function publicVendor<T extends Vendor>(vendor: T) {
  const { inviteTokenHash, ...rest } = vendor;
  void inviteTokenHash;
  return rest;
}

export const OPTIONAL_TEXT_KEYS = VENDOR_FIELDS.filter((field) => !field.required).map((field) => field.key);

/** Turns a validated patch plus the raw body into DB data: an emptied optional field becomes null. */
export function toVendorData(parsed: Record<string, unknown>, raw: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) if (value !== undefined) data[key] = value;
  for (const key of OPTIONAL_TEXT_KEYS) if (raw[key] === "" || raw[key] === null) data[key] = null;
  return data;
}

type Actor = { actorId: string; email: string; role?: "ADMIN" | "HR" | "CFO" | "CEO" | "COO" | "EMPLOYEE" };

/** Writes the audit trail for a vendor edit: ordinary fields and bank fields are logged separately. */
export async function auditVendorChange(tx: Prisma.TransactionClient, vendor: Vendor, data: Record<string, unknown>, actor: Actor, via: "ADMIN" | "VENDOR") {
  const diff = changedFields(vendor as unknown as Record<string, unknown>, data);
  if (!diff.any) return false;
  const bank = Object.fromEntries(Object.entries(diff.next).filter(([key]) => (VENDOR_BANK_KEYS as string[]).includes(key)));
  const bankBefore = Object.fromEntries(Object.keys(bank).map((key) => [key, diff.previous[key]]));
  const other = Object.fromEntries(Object.entries(diff.next).filter(([key]) => !(key in bank)));
  const otherBefore = Object.fromEntries(Object.keys(other).map((key) => [key, diff.previous[key]]));
  const base = { ...actor, module: "VENDOR", recordType: "Vendor", recordId: vendor.id, metadata: { via, vendorEmail: vendor.email } };
  if (Object.keys(other).length) {
    await audit({ ...base, action: via === "VENDOR" ? "SELF_UPDATED" : "UPDATED", previousValue: otherBefore, newValue: other }, tx);
  }
  if (Object.keys(bank).length) {
    await audit({ ...base, action: "BANK_DETAILS_CHANGED", previousValue: bankBefore, newValue: bank }, tx);
  }
  return true;
}
