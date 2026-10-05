import { NextResponse } from "next/server";
import { SupabaseAuthError } from "@/lib/email-auth";
import { AmbiguousEmployeeEmailError } from "@/lib/employee-auth";
import { ConfigurationError, publicConfigurationMessage } from "@/lib/runtime-config";

export function employeeAuthErrorResponse(error: unknown, fallback: string) {
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Request body must be valid JSON.", code: "INVALID_JSON" },
      { status: 400 },
    );
  }
  if (error instanceof ConfigurationError) {
    console.error(`[Employee auth configuration: ${error.code}] ${error.message}`);
    return NextResponse.json(
      { error: publicConfigurationMessage(error), code: error.code },
      { status: 503 },
    );
  }
  if (error instanceof SupabaseAuthError) {
    console.error(`[Supabase email auth: ${error.status}] ${error.message}`);
    const invalidLink = error.status === 400 || error.status === 401;
    return NextResponse.json(
      {
        error: invalidLink
          ? "This login link is invalid or has expired. Request a new secure login email."
          : "The secure login email service is temporarily unavailable. Please try again.",
        code: invalidLink ? "EMAIL_LINK_INVALID" : "EMAIL_AUTH_UNAVAILABLE",
      },
      { status: invalidLink ? 401 : 502 },
    );
  }
  if (error instanceof AmbiguousEmployeeEmailError) {
    return NextResponse.json(
      { error: error.message, code: "EMPLOYEE_EMAIL_AMBIGUOUS" },
      { status: 409 },
    );
  }
  if (
    error instanceof Error &&
    (error.name === "PrismaClientInitializationError" ||
      error.message.includes("Can't reach database server"))
  ) {
    console.error("[Employee auth database unavailable]", error);
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Employee sign-in is temporarily unavailable. Contact an administrator."
            : "The employee portal could not connect to PostgreSQL. Check DATABASE_URL and apply the Prisma migrations.",
        code: "DATABASE_UNAVAILABLE",
      },
      { status: 503 },
    );
  }
  console.error(error);
  return NextResponse.json({ error: fallback, code: "EMAIL_AUTH_ERROR" }, { status: 502 });
}
