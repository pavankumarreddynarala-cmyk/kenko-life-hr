import type { NextRequest } from "next/server";
import type { LetterTemplate, Role } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/app-error";
import { findEmployeeForLetter } from "@/lib/letter-service";

const bodySchema = z.object({
  templateId: z.string({ required_error: "Choose a template." }).min(1, "Choose a template."),
  values: z.record(z.string().max(2000, "Each field can hold at most 2000 characters.")).default({}),
  format: z.enum(["docx", "pdf"]).default("docx"),
  preview: z.boolean().optional(),
  employeeCode: z.string().max(60).optional(),
  recipient: z.string().max(200).optional(),
});

export async function renderBody(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message, { status: 400, code: "VALIDATION_ERROR" });
  return parsed.data;
}

/** Keeps only the fields the template really has; anything not supplied is left blank. */
export function cleanValues(values: Record<string, string>, fields: string[]) {
  return Object.fromEntries(fields.map((field) => [field, (values[field] ?? "").toString()]));
}

export function fileBase(letterType: string, values: Record<string, string>) {
  const who = (values.employee_code || values.employee_name || "letter").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 40);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${letterType.toLowerCase()}-letter-${who}-${stamp}`;
}

export async function logLetter(input: {
  template: LetterTemplate;
  session: { userId: string; email: string; role: Role };
  action: "DOWNLOADED_DOCX" | "DOWNLOADED_PDF" | "EMAILED_PDF";
  values: Record<string, string>;
  employeeCode?: string;
  sentTo?: string;
}) {
  const code = input.employeeCode || input.values.employee_code;
  const employee = code ? await findEmployeeForLetter(code) : null;
  const log = await db.letterLog.create({
    data: {
      templateId: input.template.id,
      templateName: input.template.name,
      letterType: input.template.letterType,
      employeeId: employee?.id,
      employeeCode: employee?.permanentId ?? code ?? null,
      employeeName: employee?.name ?? input.values.employee_name ?? null,
      action: input.action,
      sentTo: input.sentTo,
      actorEmail: input.session.email,
      values: input.values,
    },
  });
  await audit({ actorId: input.session.userId, email: input.session.email, role: input.session.role, module: "LETTER", recordType: "LetterLog", recordId: log.id, action: input.action, metadata: { template: input.template.name, employee: log.employeeCode, sentTo: input.sentTo } });
  return log;
}
