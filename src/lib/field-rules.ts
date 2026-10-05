// Single source of truth for Indian identifier formats (brief section 10).
// Used by the browser forms for instant feedback AND by the server schemas,
// so invalid data cannot get in through any route.

export const PAN_REGEX = /^[A-Z]{3}P[A-Z][0-9]{4}[A-Z]$/;
export const MOBILE_REGEX = /^[6-9][0-9]{9}$/;
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const UAN_REGEX = /^[0-9]{12}$/;
// Vendors are businesses as well as individuals, so the 4th PAN letter may be any holder type
// (P person, C company, F firm, H HUF, A AOP, B BOI, G government, J juridical person, L local authority, T trust).
export const BUSINESS_PAN_REGEX = /^[A-Z]{3}[ABCFGHJLPT][A-Z][0-9]{4}[A-Z]$/;
export const GSTIN_REGEX = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const ACCOUNT_NUMBER_REGEX = /^[0-9]{9,18}$/;
export const PIN_REGEX = /^[1-9][0-9]{5}$/;

export const FIELD_MESSAGES = {
  pan: "Enter a valid PAN: 5 letters, 4 digits, 1 letter, with P as the 4th character (e.g. ABCPD1234E)",
  phone: "Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9",
  ifsc: "Enter a valid IFSC: 4 letters, the digit 0, then 6 letters or digits (e.g. HDFC0001234)",
  uan: "UAN must be exactly 12 digits",
  businessPan: "Enter a valid PAN: 5 letters, 4 digits, 1 letter (e.g. AABCK1234F). The 4th letter shows the holder type.",
  gstin: "Enter a valid 15-character GSTIN (e.g. 36AABCK1234F1Z5), or leave it blank if the business is not GST-registered",
  gstinPanMismatch: "The PAN inside this GSTIN (characters 3 to 12) does not match the PAN you entered. Check both.",
  accountNumber: "Account number must be 9 to 18 digits",
  pin: "PIN code must be 6 digits and cannot start with 0",
} as const;

export const normalizePan = (value: string) => value.trim().toUpperCase();
export const normalizeIfsc = (value: string) => value.trim().toUpperCase();

/** Returns an error message, or "" when the value is empty (optional) or valid. */
export function fieldError(field: "pan" | "phone" | "ifsc" | "uan", value: unknown, required = false): string {
  const text = String(value ?? "").trim();
  if (!text) return required ? "This field is required" : "";
  if (field === "pan") return PAN_REGEX.test(normalizePan(text)) ? "" : FIELD_MESSAGES.pan;
  if (field === "ifsc") return IFSC_REGEX.test(normalizeIfsc(text)) ? "" : FIELD_MESSAGES.ifsc;
  if (field === "uan") return UAN_REGEX.test(text) ? "" : FIELD_MESSAGES.uan;
  return MOBILE_REGEX.test(text) ? "" : FIELD_MESSAGES.phone;
}
