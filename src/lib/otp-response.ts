import { NextResponse } from "next/server";
import { ConfigurationError, publicConfigurationMessage } from "@/lib/runtime-config";

export function otpErrorResponse(error: unknown, fallback: string) {
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Request body must be valid JSON.", code: "INVALID_JSON" },
      { status: 400 },
    );
  }
  if (error instanceof ConfigurationError) {
    console.error(`[OTP configuration: ${error.code}] ${error.message}`);
    return NextResponse.json(
      { error: publicConfigurationMessage(error), code: error.code },
      { status: 503 },
    );
  }
  if (
    error instanceof Error &&
    (error.name === "PrismaClientInitializationError" ||
      error.message.includes("Can't reach database server"))
  ) {
    console.error("[OTP database unavailable]", error);
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
  return NextResponse.json({ error: fallback, code: "OTP_SERVICE_ERROR" }, { status: 502 });
}
