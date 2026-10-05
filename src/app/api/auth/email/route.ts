import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { sendEmailMagicLink } from "@/lib/email-auth";
import { employeeAuthErrorResponse } from "@/lib/auth-response";
import { requireDatabaseConfiguration, requireEmailAuthConfiguration } from "@/lib/runtime-config";

const requestSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").transform((value) => value.toLowerCase()),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message, code: "INVALID_EMAIL" },
        { status: 400 },
      );
    }

    requireDatabaseConfiguration();
    requireEmailAuthConfiguration();
    const { email } = parsed.data;
    const requestIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const recent = await db.auditLog.count({
      where: {
        module: "AUTH",
        action: "EMAIL_LINK_REQUESTED",
        createdAt: { gt: new Date(Date.now() - 60_000) },
        OR: [
          { email },
          { metadata: { path: ["requestIp"], equals: requestIp } },
        ],
      },
    });
    if (recent >= 3) {
      return NextResponse.json(
        { error: "Please wait before requesting another login email.", code: "EMAIL_RATE_LIMITED" },
        { status: 429 },
      );
    }

    await audit({
      actorId: email,
      email,
      module: "AUTH",
      recordType: "EmployeeEmail",
      recordId: email,
      action: "EMAIL_LINK_REQUESTED",
      metadata: { provider: "supabase", requestIp },
    });
    await sendEmailMagicLink(email);
    return NextResponse.json({
      email,
      message: "Check your inbox for a secure login link. The link can be used only once.",
    });
  } catch (error) {
    return employeeAuthErrorResponse(
      error,
      "Unable to send the secure login email. Please try again or contact an administrator.",
    );
  }
}
