import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { VENDOR_BANK_KEYS, VENDOR_FIELDS, VENDOR_TYPES, type VendorFieldKey } from "@/lib/vendor-fields";
import { ACCOUNT_NUMBER_REGEX, BUSINESS_PAN_REGEX, FIELD_MESSAGES, GSTIN_REGEX, IFSC_REGEX, MOBILE_REGEX, PIN_REGEX } from "@/lib/field-rules";
import { INDIAN_STATES_AND_UTS } from "@/lib/validators";

export const INVITE_DAYS = 14;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newInviteToken = () => randomBytes(24).toString("base64url");

const blank = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max, `Use at most ${max} characters.`).optional());

const fields = {
  legalName: z.string({ required_error: "Enter the legal name." }).trim().min(2, "Enter the legal / registered name.").max(160),
  tradeName: text(160),
  vendorType: z.enum(VENDOR_TYPES, { errorMap: () => ({ message: "Choose the type of vendor from the list." }) }),
  contactPerson: z.string({ required_error: "Enter the contact person." }).trim().min(2, "Enter the contact person's name.").max(120),
  phone: z.string({ required_error: FIELD_MESSAGES.phone }).trim().regex(MOBILE_REGEX, FIELD_MESSAGES.phone),
  address1: z.string({ required_error: "Enter the address." }).trim().min(3, "Enter the address (at least 3 characters).").max(200),
  address2: text(200),
  city: z.string({ required_error: "Enter the city." }).trim().min(2, "Enter the city.").max(80),
  state: z.enum(INDIAN_STATES_AND_UTS, { errorMap: () => ({ message: "Choose the state or union territory from the list." }) }),
  pinCode: z.string({ required_error: FIELD_MESSAGES.pin }).trim().regex(PIN_REGEX, FIELD_MESSAGES.pin),
  gstin: z.preprocess(blank, z.string().trim().toUpperCase().regex(GSTIN_REGEX, FIELD_MESSAGES.gstin).optional()),
  pan: z.string({ required_error: FIELD_MESSAGES.businessPan }).trim().toUpperCase().regex(BUSINESS_PAN_REGEX, FIELD_MESSAGES.businessPan),
  msmeNumber: text(40),
  website: z.preprocess(blank, z.string().trim().url("Enter a full website address, for example https://example.com").max(200).optional()),
  bankHolderName: z.string({ required_error: "Enter the account holder name." }).trim().min(2, "Enter the account holder name.").max(120),
  bankName: z.string({ required_error: "Enter the bank name." }).trim().min(2, "Enter the bank name.").max(120),
  bankBranch: text(120),
  accountNumber: z.string({ required_error: FIELD_MESSAGES.accountNumber }).trim().regex(ACCOUNT_NUMBER_REGEX, FIELD_MESSAGES.accountNumber),
  ifscCode: z.string({ required_error: FIELD_MESSAGES.ifsc }).trim().toUpperCase().regex(IFSC_REGEX, FIELD_MESSAGES.ifsc),
} satisfies Record<VendorFieldKey, z.ZodTypeAny>;

function gstMatchesPan<T extends { gstin?: string; pan?: string }>(value: T, ctx: z.RefinementCtx) {
  if (value.gstin && value.pan && value.gstin.slice(2, 12) !== value.pan) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["gstin"], message: FIELD_MESSAGES.gstinPanMismatch });
  }
}

/** First submission through the link: every mandatory field, bank details included. */
export const vendorSubmitSchema = z.object(fields).superRefine(gstMatchesPan);

/** Later edits: any subset. The route decides whether the bank fields may be included. */
export const vendorPatchSchema = z
  .object(Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, schema.optional()])) as { [K in VendorFieldKey]: z.ZodOptional<(typeof fields)[K]> })
  .partial()
  .superRefine(gstMatchesPan);

export const vendorInviteSchema = z.object({
  email: z.string({ required_error: "Enter the vendor's email address." }).trim().toLowerCase().email("Enter a valid email address such as accounts@vendor.com."),
  legalName: text(160),
});

export const VENDOR_COLUMNS = Object.fromEntries(VENDOR_FIELDS.map((field) => [field.key, true])) as Record<VendorFieldKey, true>;

export function bankFieldsIn(values: Record<string, unknown>): VendorFieldKey[] {
  return VENDOR_BANK_KEYS.filter((key) => key in values && values[key] !== undefined);
}

export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  const previous: Record<string, unknown> = {};
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const a = before[key] ?? null;
    const b = after[key] ?? null;
    if (a !== b) {
      previous[key] = a;
      next[key] = b;
    }
  }
  return { previous, next, any: Object.keys(next).length > 0 };
}
