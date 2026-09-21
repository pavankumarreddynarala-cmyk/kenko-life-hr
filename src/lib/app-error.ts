export type FieldIssue = { field: string; label?: string; message: string };

/**
 * An error whose message is safe and useful to show to the person using the app.
 * Route handlers throw these (or let apiError translate zod/Prisma errors into them) so
 * that every failure explains what went wrong, which field is affected and what to do.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: FieldIssue[];

  constructor(message: string, options: { status?: number; code?: string; fields?: FieldIssue[] } = {}) {
    super(message);
    this.name = "AppError";
    this.status = options.status ?? 400;
    this.code = options.code ?? "REQUEST_REJECTED";
    this.fields = options.fields;
  }
}

export function unauthenticated() {
  return new AppError("Your session has expired or you are not signed in. Sign in again to continue.", {
    status: 401,
    code: "UNAUTHENTICATED",
  });
}

export function forbidden(message?: string) {
  return new AppError(
    message ?? "Your role does not have permission to do this. Ask an Admin, CEO or COO to do it for you.",
    { status: 403, code: "FORBIDDEN" },
  );
}

export function notFound(what: string) {
  return new AppError(
    `${what} could not be found. It may have been deleted or moved — refresh the page and try again.`,
    { status: 404, code: "NOT_FOUND" },
  );
}

export function conflict(message: string, field?: FieldIssue) {
  return new AppError(message, { status: 409, code: "CONFLICT", fields: field ? [field] : undefined });
}
