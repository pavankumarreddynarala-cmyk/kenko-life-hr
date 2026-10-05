import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { AppError } from "@/lib/app-error";

const OPTIONS = { delimiters: { start: "{{", end: "}}" }, paragraphLoop: true, linebreaks: true, nullGetter: () => "" } as const;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

function open(buffer: Buffer) {
  try {
    return new Docxtemplater(new PizZip(buffer), OPTIONS);
  } catch (error) {
    const detail = describeTemplateError(error);
    throw new AppError(`This Word file cannot be used as a template. ${detail}`, { status: 400, code: "TEMPLATE_INVALID", fields: [{ field: "file", message: detail }] });
  }
}

function describeTemplateError(error: unknown) {
  const e = error as { properties?: { errors?: { properties?: { explanation?: string } }[] }; message?: string };
  const first = e.properties?.errors?.[0]?.properties?.explanation;
  if (first) return `${first} Check that every {{field}} has both braces and no stray { or } characters.`;
  if (/zip|central directory|corrupt/i.test(e.message ?? "")) return "The file is not a valid .docx Word document (save it from Word as .docx).";
  return "Check that the file is a .docx and that every {{field}} is written correctly.";
}

/** The field names written as {{name}} in the body, headers and footers, in order of first appearance. */
export function extractFields(buffer: Buffer): string[] {
  const doc = open(buffer);
  const parts = Object.keys(doc.getZip().files).filter((name) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(name));
  const found: string[] = [];
  for (const part of parts) {
    const text = doc.getFullText(part);
    for (const match of text.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)) {
      const name = match[1];
      if (FIELD_NAME.test(name) && !found.includes(name)) found.push(name);
    }
  }
  return found;
}

/** Fills the template. Formatting is untouched because only the text of the placeholders is replaced. */
export function renderTemplate(buffer: Buffer, values: Record<string, string>): Buffer {
  const doc = open(buffer);
  try {
    doc.render(values);
  } catch (error) {
    throw new AppError(`The letter could not be prepared. ${describeTemplateError(error)}`, { status: 400, code: "TEMPLATE_RENDER" });
  }
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const PDF_MIME = "application/pdf";

const longDate = (date: Date | null | undefined) =>
  date ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date) : "";

type EmployeeForLetter = {
  name: string; permanentId: string; gender: string | null; fatherName: string | null; email: string | null; personalEmail: string | null; phone: string;
  address1: string | null; address2: string | null; pinCode: string | null; state: string | null; joiningDate: Date | null; exitDate: Date | null; dateOfBirth: Date | null;
  department: { name: string } | null; designation: { name: string } | null; employeeRole: { name: string } | null; company: { name: string } | null; city: { name: string } | null;
};

/** The values a standard field takes from the Employee Master. Editable afterwards. */
export function employeeLetterValues(e: EmployeeForLetter, today = new Date()): Record<string, string> {
  return {
    letter_date: longDate(today),
    salutation: e.gender === "MALE" ? "Mr." : e.gender === "FEMALE" ? "Ms." : "",
    employee_name: e.name,
    employee_code: e.permanentId,
    designation: e.designation?.name ?? "",
    department: e.department?.name ?? "",
    employee_role: e.employeeRole?.name ?? "",
    company_name: e.company?.name ?? "",
    joining_date: longDate(e.joiningDate),
    last_working_day: longDate(e.exitDate),
    date_of_birth: longDate(e.dateOfBirth),
    father_name: e.fatherName ?? "",
    address: [e.address1, e.address2].filter(Boolean).join(", "),
    city: e.city?.name ?? "",
    state: e.state ?? "",
    pin_code: e.pinCode ?? "",
    email: e.personalEmail || e.email || "",
    phone: e.phone,
  };
}
