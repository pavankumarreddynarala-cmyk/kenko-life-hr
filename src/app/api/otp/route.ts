import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendOtp } from "@/lib/otp";
import { phoneSchema } from "@/lib/validators";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const parsed = phoneSchema.safeParse((await req.json()).phone);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const phone = parsed.data;
  const requestIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const recent = await db.employeeOtp.count({
    where: {
      createdAt: { gt: new Date(Date.now() - 60_000) },
      OR: [{ phone }, { requestIp }],
    },
  });
  if (recent >= 3) {
    return NextResponse.json({ error: "Please wait before requesting another OTP" }, { status: 429 });
  }
  try {
    await sendOtp(phone, requestIp);
    if ((process.env.OTP_PROVIDER ?? "development") !== "development") {
      await db.employeeOtp.create({
        data: { phone, codeHash: "external-provider", expiresAt: new Date(Date.now() + 10 * 60_000), requestIp },
      });
    }
    await audit({
      actorId: phone,
      module: "AUTH",
      recordType: "EmployeePhone",
      recordId: phone,
      action: "OTP_REQUESTED",
      metadata: { provider: process.env.OTP_PROVIDER ?? "development" },
    });
    return NextResponse.json({ message: "OTP sent to your mobile number." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send OTP";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
