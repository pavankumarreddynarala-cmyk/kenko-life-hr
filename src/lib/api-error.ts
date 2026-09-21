import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError, type FieldIssue } from "@/lib/app-error";
import { fieldLabel } from "@/lib/field-labels";
import { summariseIssues, zodFieldIssues } from "@/lib/zod-errors";

type ErrorPayload = { error: string; code: string; fields?: FieldIssue[]; reference?: string };

function respond(payload: ErrorPayload, status: number) {
  return NextResponse.json(payload, { status });
}

/** Turns a zod failure into a 400 that names every field and says how to fix it. */
export function validationError(error: ZodError) {
  const fields = zodFieldIssues(error);
  return respond({ error: summariseIssues(fields), code: "VALIDATION_ERROR", fields }, 400);
}

function uniqueTargetFields(error: Prisma.PrismaClientKnownRequestError): string[] {
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === "string") {
    // Postgres constraint name, e.g. "Employee_phone_key" -> "phone".
    const match = target.match(/^[A-Za-z]+_(.+)_(?:key|idx)$/);
    return [match ? match[1] : target];
  }
  return [];
}

function prismaError(error: Prisma.PrismaClientKnownRequestError, fallback: string) {
  switch (error.code) {
    case "P2002": {
      const names = uniqueTargetFields(error);
      // The Organisation Code is derived by the database from the Employee Code and the
      // organisation fields, so the user cannot type a different one — say what to change.
      if (names.includes("dynamicId")) {
        return respond(
          {
            error:
              "This change would give two employees the same Organisation Code, and nothing was saved. Change the Employee Code, or one of the organisation fields (city, outlet model, area code, outlets, department, role), so the two employees differ.",
            code: "DUPLICATE_VALUE",
            fields: [{ field: "permanentId", label: fieldLabel("permanentId"), message: "This Employee Code produces an Organisation Code that another employee already has." }],
          },
          409,
        );
      }
      const fields = names.map((field) => ({
        field,
        label: fieldLabel(field),
        message: `This ${fieldLabel(field).toLowerCase()} is already used by another record. Enter a different value, or open the existing record instead.`,
      }));
      const label = names.map((field) => fieldLabel(field).toLowerCase()).join(" / ") || "value";
      return respond(
        {
          error: `A record with this ${label} already exists, so nothing was saved. Enter a different ${label}, or open the existing record instead of creating a new one.`,
          code: "DUPLICATE_VALUE",
          fields,
        },
        409,
      );
    }
    case "P2003":
      return respond(
        {
          error:
            "This record is still linked to other records, so the change was not made. Remove or reassign the linked records first, then try again.",
          code: "RECORD_IN_USE",
        },
        409,
      );
    case "P2025":
      return respond(
        {
          error:
            "The record you are working on no longer exists — someone else may have deleted it. Refresh the page and try again.",
          code: "NOT_FOUND",
        },
        404,
      );
    case "P2034":
      return respond(
        {
          error:
            "Someone else changed the same data at the same moment, so nothing was saved. Refresh the page and try again.",
          code: "WRITE_CONFLICT",
        },
        409,
      );
    default:
      return unexpected(error, fallback, 500);
  }
}

function unexpected(error: unknown, fallback: string, status: number) {
  const reference = Math.random().toString(36).slice(2, 10).toUpperCase();
  console.error(`[${reference}] ${fallback}`, error);
  const trimmed = fallback.replace(/[.\s]+$/, "");
  const lead = /^unable to/i.test(trimmed) ? `${trimmed} because of` : `${trimmed} failed because of`;
  return respond(
    {
      error: `${lead} an unexpected problem on the server. Nothing was changed. Try again in a moment; if it keeps happening, contact an administrator and quote reference ${reference}.`,
      code: "INTERNAL_ERROR",
      reference,
    },
    status,
  );
}

/**
 * Single place that converts anything thrown inside a route handler into a JSON error the
 * UI can show verbatim: what went wrong, which field, and what to do next.
 * `fallback` names the action that failed, e.g. "Unable to load employees".
 */
export function apiError(error: unknown, fallback: string, status = 500) {
  if (error instanceof AppError) {
    return respond(
      { error: error.message, code: error.code, ...(error.fields ? { fields: error.fields } : {}) },
      error.status,
    );
  }
  if (error instanceof ZodError) return validationError(error);
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return respond(
      { error: "Your session has expired or you are not signed in. Sign in again to continue.", code: "UNAUTHENTICATED" },
      401,
    );
  }
  if (error instanceof Error && error.message === "FORBIDDEN") {
    return respond(
      { error: "Your role does not have permission to do this. Ask an Admin, CEO or COO to do it for you.", code: "FORBIDDEN" },
      403,
    );
  }
  if (error instanceof SyntaxError) {
    return respond(
      { error: "The request could not be read. Reload the page and try again.", code: "INVALID_JSON" },
      400,
    );
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) return prismaError(error, fallback);
  // A malformed or missing DATABASE_URL is a deployment setting problem, not an outage —
  // say so (the exact reason is in the server log; the user only needs to alert an admin).
  if (
    error instanceof Error &&
    /must start with the protocol|Environment variable not found|Error validating datasource/i.test(error.message)
  ) {
    console.error("[DATABASE_URL is missing or malformed] Set DATABASE_URL to a postgresql:// URL with no quotes or spaces, then redeploy.", error.message.split("\n").find((line) => /protocol|not found/i.test(line)));
    return respond(
      {
        error:
          "The system's database connection is not configured correctly, so this could not be done. Contact an administrator — the DATABASE_URL setting on the server needs to be corrected.",
        code: "DATABASE_NOT_CONFIGURED",
      },
      503,
    );
  }
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Error && error.message.includes("Can't reach database server"))
  ) {
    console.error("[database unavailable]", error);
    return respond(
      {
        error:
          "The system could not reach its database, so nothing was saved. Wait a minute and try again; if it continues, contact an administrator.",
        code: "DATABASE_UNAVAILABLE",
      },
      503,
    );
  }
  return unexpected(error, fallback, status);
}
