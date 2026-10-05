// Client-safe: the standard fields a letter template can use, and how to label any other field.
// In the Word template, mark an editable spot like {{employee_name}}. A standard field is filled
// from the Employee Master when an employee is chosen; any other name becomes a blank editable field.

export const STANDARD_LETTER_FIELDS: { key: string; label: string; long?: boolean }[] = [
  { key: "letter_date", label: "Letter date" },
  { key: "salutation", label: "Salutation (Mr. / Ms.)" },
  { key: "employee_name", label: "Employee name" },
  { key: "employee_code", label: "Employee ID" },
  { key: "designation", label: "Designation" },
  { key: "department", label: "Department / division" },
  { key: "employee_role", label: "Role" },
  { key: "company_name", label: "Company" },
  { key: "joining_date", label: "Date of joining" },
  { key: "last_working_day", label: "Last working day" },
  { key: "date_of_birth", label: "Date of birth" },
  { key: "father_name", label: "Father's name" },
  { key: "address", label: "Address", long: true },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "pin_code", label: "PIN code" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Mobile number" },
];

export const LETTER_TYPES = [
  ["OFFER", "Offer letter"],
  ["RELIEVING", "Relieving letter"],
  ["EXPERIENCE", "Experience letter"],
  ["OTHER", "Other letter"],
] as const;

export const letterTypeLabel = (type: string) => LETTER_TYPES.find(([key]) => key === type)?.[1] ?? type;

export function fieldLabel(key: string) {
  const standard = STANDARD_LETTER_FIELDS.find((field) => field.key === key);
  if (standard) return standard.label;
  const words = key.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const isLongField = (key: string) => Boolean(STANDARD_LETTER_FIELDS.find((field) => field.key === key)?.long) || /address|remarks|paragraph|details|description/.test(key);
