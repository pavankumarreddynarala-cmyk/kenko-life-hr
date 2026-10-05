// Single source of truth for Indian identifier formats (brief section 10).
// Used by the browser forms for instant feedback AND by the server schemas,
// so invalid data cannot get in through any route.

export const PAN_REGEX = /^[A-Z]{3}P[A-Z][0-9]{4}[A-Z]$/;
export const MOBILE_REGEX = /^[6-9][0-9]{9}$/;
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const UAN_REGEX = /^[0-9]{12}$/;

export const FIELD_MESSAGES = {
  pan: "Enter a valid PAN: 5 letters, 4 digits, 1 letter, with P as the 4th character (e.g. ABCPD1234E)",
  phone: "Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9",
  ifsc: "Enter a valid IFSC: 4 letters, the digit 0, then 6 letters or digits (e.g. HDFC0001234)",
  uan: "UAN must be exactly 12 digits",
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
