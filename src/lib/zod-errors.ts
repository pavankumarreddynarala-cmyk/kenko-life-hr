import { z, ZodError } from "zod";
import { fieldLabel } from "@/lib/field-labels";
import type { FieldIssue } from "@/lib/app-error";

// Zod's stock messages ("Required", "Invalid", "String must contain at least 2
// character(s)") say nothing about what to do. This map replaces them everywhere a schema
// does not supply its own message. The field name is added when the error is formatted.
const errorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined" || issue.received === "null") {
        return { message: "This field is required. Enter a value and try again." };
      }
      if (issue.expected === "number" || issue.expected === "integer") {
        return { message: "Enter a number using digits only (for example 1500 or 1500.50)." };
      }
      return { message: `The value is not in the expected format (${issue.expected}). Re-enter it and try again.` };
    case z.ZodIssueCode.too_small:
      if (issue.type === "string") {
        return {
          message:
            Number(issue.minimum) <= 1
              ? "This field cannot be empty. Enter a value and try again."
              : `Enter at least ${issue.minimum} characters.`,
        };
      }
      return { message: `Enter a value of ${issue.minimum} or more.` };
    case z.ZodIssueCode.too_big:
      if (issue.type === "string") return { message: `Use at most ${issue.maximum} characters — shorten the text.` };
      return { message: `Enter a value of ${issue.maximum} or less.` };
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === "email") return { message: "Enter a valid email address such as name@company.com." };
      return { message: "The format is not valid. Check the value and try again." };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: "Choose one of the options from the drop-down list." };
    case z.ZodIssueCode.invalid_date:
      return { message: "Enter a valid date (day, month and year)." };
    default:
      return { message: ctx.defaultError };
  }
};

z.setErrorMap(errorMap);

export function zodFieldIssues(error: ZodError): FieldIssue[] {
  const seen = new Set<string>();
  const issues: FieldIssue[] = [];
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    const key = `${field}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({ field, label: field ? fieldLabel(field) : undefined, message: issue.message });
  }
  return issues;
}

/** One sentence per problem: "PAN number: Enter a valid PAN…". */
export function describeIssue(issue: FieldIssue): string {
  return issue.label ? `${issue.label}: ${issue.message}` : issue.message;
}

export function summariseIssues(issues: FieldIssue[]): string {
  if (issues.length === 0) return "The details you entered could not be accepted. Check the form and try again.";
  if (issues.length === 1) return describeIssue(issues[0]);
  return `${issues.length} fields need attention. ${issues.map(describeIssue).join(" ")}`;
}
