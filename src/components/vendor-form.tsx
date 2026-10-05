"use client";

import { Field, inputClass, RequiredLegend } from "@/components/form";
import { VENDOR_SECTIONS, VENDOR_TYPES, type VendorField, type VendorFieldKey } from "@/lib/vendor-fields";
import { ACCOUNT_NUMBER_REGEX, BUSINESS_PAN_REGEX, FIELD_MESSAGES, GSTIN_REGEX, IFSC_REGEX, MOBILE_REGEX, PIN_REGEX } from "@/lib/field-rules";
import { INDIAN_STATES_AND_UTS } from "@/lib/validators";

export type VendorValues = Partial<Record<VendorFieldKey, string | null>>;
export type VendorErrors = Record<string, string>;

/** Keeps what is typed clean as the person types: digits only where digits are expected, capitals for IDs. */
export function cleanVendorInput(key: VendorFieldKey, value: string) {
  if (key === "phone") return value.replace(/\D/g, "").slice(0, 10);
  if (key === "pinCode") return value.replace(/\D/g, "").slice(0, 6);
  if (key === "accountNumber") return value.replace(/\D/g, "").slice(0, 18);
  if (key === "pan") return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  if (key === "gstin") return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15);
  if (key === "ifscCode") return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11);
  return value;
}

/** The same rules the server applies, so mistakes show up before anything is sent. */
export function vendorErrors(values: VendorValues, opts: { includeBank: boolean }): VendorErrors {
  const errors: VendorErrors = {};
  for (const section of VENDOR_SECTIONS) {
    for (const field of section.fields) {
      if (field.bank && !opts.includeBank) continue;
      const value = String(values[field.key] ?? "").trim();
      if (!value) {
        if (field.required) errors[field.key] = "This field is required.";
        continue;
      }
      const rules: Partial<Record<VendorFieldKey, [RegExp, string]>> = {
        phone: [MOBILE_REGEX, FIELD_MESSAGES.phone],
        pinCode: [PIN_REGEX, FIELD_MESSAGES.pin],
        pan: [BUSINESS_PAN_REGEX, FIELD_MESSAGES.businessPan],
        gstin: [GSTIN_REGEX, FIELD_MESSAGES.gstin],
        accountNumber: [ACCOUNT_NUMBER_REGEX, FIELD_MESSAGES.accountNumber],
        ifscCode: [IFSC_REGEX, FIELD_MESSAGES.ifsc],
      };
      const rule = rules[field.key];
      if (rule && !rule[0].test(value)) errors[field.key] = rule[1];
    }
  }
  const gstin = String(values.gstin ?? "").trim();
  const pan = String(values.pan ?? "").trim();
  if (!errors.gstin && !errors.pan && gstin && pan && gstin.slice(2, 12) !== pan) errors.gstin = FIELD_MESSAGES.gstinPanMismatch;
  return errors;
}

function control(field: VendorField, values: VendorValues, error: string | undefined, readOnly: boolean, onChange: (key: VendorFieldKey, value: string) => void) {
  const value = String(values[field.key] ?? "");
  const common = { className: inputClass(Boolean(error), readOnly ? "bg-stone-100 text-stone-600" : ""), value, disabled: readOnly };
  if (field.type === "select-state") {
    return (
      <select {...common} onChange={(event) => onChange(field.key, event.target.value)}>
        <option value="">Select state / UT</option>
        {INDIAN_STATES_AND_UTS.map((state) => <option key={state}>{state}</option>)}
      </select>
    );
  }
  if (field.type === "select-type") {
    return (
      <select {...common} onChange={(event) => onChange(field.key, event.target.value)}>
        <option value="">Select type</option>
        {VENDOR_TYPES.map((type) => <option key={type}>{type}</option>)}
      </select>
    );
  }
  return (
    <input
      {...common}
      type={field.type === "url" ? "url" : field.type === "tel" ? "tel" : "text"}
      inputMode={field.inputMode}
      maxLength={field.maxLength}
      autoCapitalize={["pan", "gstin", "ifscCode"].includes(field.key) ? "characters" : undefined}
      autoComplete="off"
      onChange={(event) => onChange(field.key, event.target.value)}
    />
  );
}

export function VendorForm({
  values,
  errors,
  onChange,
  bankReadOnly = false,
  readOnlyKeys = [],
}: {
  values: VendorValues;
  errors: VendorErrors;
  onChange: (key: VendorFieldKey, value: string) => void;
  bankReadOnly?: boolean;
  readOnlyKeys?: VendorFieldKey[];
}) {
  return (
    <div className="space-y-6">
      <RequiredLegend />
      {VENDOR_SECTIONS.map((section) => (
        <fieldset key={section.title} className="rounded-xl border border-stone-200 p-4">
          <legend className="px-2 text-sm font-bold text-kenko-green">{section.title}</legend>
          {section.title === "Bank details" && bankReadOnly && (
            <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              Bank details are locked after the first submission. To change them, contact The Kenko Life; only an administrator can update them.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {section.fields.map((field) => {
              const readOnly = (field.bank && bankReadOnly) || readOnlyKeys.includes(field.key);
              return (
                <Field key={field.key} label={field.label} required={field.required && !readOnly} error={errors[field.key]} hint={field.hint}>
                  {control(field, values, errors[field.key], Boolean(readOnly), onChange)}
                </Field>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
