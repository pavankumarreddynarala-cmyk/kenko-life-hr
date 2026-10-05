import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DOCUMENT_ROLES, requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { AppError, notFound } from "@/lib/app-error";
import { renderTemplate } from "@/lib/letters";
import { docxToPdf } from "@/lib/pdf-convert";
import { findEmployeeForLetter } from "@/lib/letter-service";
import { letterTypeLabel } from "@/lib/letter-fields";
import { mailConfigured, replyToAddress, sendMail } from "@/lib/mail";
import { ConfigurationError } from "@/lib/runtime-config";
import { cleanValues, fileBase, logLetter, renderBody } from "@/lib/letter-render";

export const dynamic = "force-dynamic";

// Sends the letter to the chosen employee as a PDF only. The Word letter is converted first.
export async function POST(req: NextRequest) {
  try {
    const session = requireRole(req, DOCUMENT_ROLES, "Only an Admin, CEO, COO or HR can send letters.");
    const body = await renderBody(req);
    const lookup = (body.recipient || body.employeeCode || "").trim();
    if (!lookup) throw new AppError("Enter the employee's ID or email to send the letter to.", { status: 400, code: "VALIDATION_ERROR", fields: [{ field: "employee", message: "Enter an Employee ID or email." }] });
    const employee = await findEmployeeForLetter(lookup);
    if (!employee) throw new AppError(`No employee was found for “${lookup}”. Check the Employee ID or email.`, { status: 404, code: "NOT_FOUND", fields: [{ field: "employee", message: "No employee found." }] });
    const to = lookup.includes("@") ? lookup.toLowerCase() : employee.personalEmail || employee.email;
    if (!to) throw new AppError(`${employee.name} (${employee.permanentId}) has no email address in the Employee Master. Add one, or download the PDF and send it yourself.`, { status: 400, code: "NO_EMAIL" });
    if (!mailConfigured()) {
      throw new ConfigurationError("MAIL_NOT_CONFIGURED", "Email is not configured.", "Email sending is not set up yet. Download the PDF and send it from your own mailbox, or ask the main administrator to add the SMTP settings.");
    }
    const template = await db.letterTemplate.findUnique({ where: { id: body.templateId } });
    if (!template || !template.active) throw notFound("The template");
    const values = cleanValues(body.values, template.fields);
    // Convert first: if the PDF cannot be made, nothing is sent and nothing is logged as sent.
    const pdf = await docxToPdf(renderTemplate(Buffer.from(template.content), values));
    const label = letterTypeLabel(template.letterType);
    try {
      await sendMail({
        to,
        subject: `${label} – The Kenko Life`,
        text: `Dear ${employee.name},\n\nPlease find your ${label.toLowerCase()} attached as a PDF.\n\nIf you have any questions, reply to this email and it will reach ${replyToAddress()}.\n\nRegards,\nThe Kenko Life`,
        attachments: [{ filename: `${fileBase(template.letterType, values)}.pdf`, content: pdf, contentType: "application/pdf" }],
      });
    } catch (error) {
      console.error("Letter email failed", error);
      throw new AppError("The email could not be sent, so the letter was not delivered. Check the email settings or download the PDF and send it yourself.", { status: 502, code: "MAIL_FAILED" });
    }
    await logLetter({ template, session, action: "EMAILED_PDF", values, employeeCode: employee.permanentId, sentTo: to });
    return NextResponse.json({ ok: true, sentTo: to, employee: { code: employee.permanentId, name: employee.name } });
  } catch (error) {
    return apiError(error, "Sending the letter");
  }
}
