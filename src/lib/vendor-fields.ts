// Client-safe vendor field definitions: used by the vendor link form, the vendor's own view,
// the admin editor and the Excel export, so all of them always list the same fields.

export type VendorFieldKey =
  | "legalName" | "tradeName" | "vendorType" | "contactPerson" | "phone"
  | "address1" | "address2" | "city" | "state" | "pinCode"
  | "gstin" | "pan" | "msmeNumber" | "website"
  | "bankHolderName" | "bankName" | "bankBranch" | "accountNumber" | "ifscCode";

export type VendorField = {
  key: VendorFieldKey;
  label: string;
  required: boolean;
  bank?: boolean;
  type?: "text" | "tel" | "url" | "select-state" | "select-type";
  inputMode?: "numeric" | "text";
  maxLength?: number;
  hint?: string;
};

export const VENDOR_TYPES = ["Goods supplier", "Service provider", "Contractor", "Landlord / property owner", "Consultant / professional", "Other"] as const;

export const VENDOR_SECTIONS: { title: string; fields: VendorField[] }[] = [
  {
    title: "Business details",
    fields: [
      { key: "legalName", label: "Legal / registered name", required: true },
      { key: "tradeName", label: "Trade name (if different)", required: false },
      { key: "vendorType", label: "Type of vendor", required: true, type: "select-type" },
      { key: "contactPerson", label: "Contact person", required: true },
      { key: "phone", label: "Mobile number (10 digits)", required: true, type: "tel", inputMode: "numeric", maxLength: 10 },
    ],
  },
  {
    title: "Address",
    fields: [
      { key: "address1", label: "Address line 1", required: true },
      { key: "address2", label: "Address line 2", required: false },
      { key: "city", label: "City", required: true },
      { key: "state", label: "State / Union Territory", required: true, type: "select-state" },
      { key: "pinCode", label: "PIN code", required: true, inputMode: "numeric", maxLength: 6 },
    ],
  },
  {
    title: "Tax & registration",
    fields: [
      { key: "pan", label: "PAN", required: true, maxLength: 10 },
      { key: "gstin", label: "GSTIN", required: false, maxLength: 15, hint: "Leave blank only if the business is not GST-registered." },
      { key: "msmeNumber", label: "MSME / Udyam number", required: false },
      { key: "website", label: "Website", required: false, type: "url" },
    ],
  },
  {
    title: "Bank details",
    fields: [
      { key: "bankHolderName", label: "Account holder name", required: true, bank: true },
      { key: "bankName", label: "Bank name", required: true, bank: true },
      { key: "bankBranch", label: "Branch", required: false, bank: true },
      { key: "accountNumber", label: "Account number", required: true, bank: true, inputMode: "numeric", maxLength: 18 },
      { key: "ifscCode", label: "IFSC code", required: true, bank: true, maxLength: 11 },
    ],
  },
];

export const VENDOR_FIELDS: VendorField[] = VENDOR_SECTIONS.flatMap((section) => section.fields);
export const VENDOR_BANK_KEYS = VENDOR_FIELDS.filter((field) => field.bank).map((field) => field.key);
export const VENDOR_LABELS = Object.fromEntries(VENDOR_FIELDS.map((field) => [field.key, field.label])) as Record<VendorFieldKey, string>;
