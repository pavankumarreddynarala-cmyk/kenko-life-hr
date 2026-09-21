import { fieldLabel } from "@/lib/field-labels";

export type FormErrors = Record<string, string>;

function isBlank(value: unknown) {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

/**
 * Client-side mandatory-field check that runs before a form is submitted. Returns one
 * message per empty required field (keyed by field name); an empty object means the form
 * may be submitted. The server validates again — this only stops the obvious omissions
 * before a round trip.
 */
export function requiredErrors(
  values: Record<string, unknown>,
  required: readonly string[],
  labels: Record<string, string> = {},
): FormErrors {
  const errors: FormErrors = {};
  for (const key of required) {
    if (isBlank(values[key])) {
      const label = labels[key] ?? fieldLabel(key);
      errors[key] = `${label} is required. Fill it in before saving.`;
    }
  }
  return errors;
}

/** "Employee Name, Mobile number" — for the toast shown when a submit is blocked. */
export function describeMissing(errors: FormErrors, labels: Record<string, string> = {}): string {
  return Object.keys(errors)
    .map((key) => labels[key] ?? fieldLabel(key))
    .join(", ");
}
