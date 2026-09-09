import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

type Provider = "development" | "supabase" | "twilio";

function provider(): Provider {
  const value = process.env.OTP_PROVIDER ?? "development";
  if (value === "development" || value === "supabase" || value === "twilio") return value;
  throw new Error(`Unsupported OTP_PROVIDER: ${value}`);
}

async function expectProviderSuccess(response: Response, providerName: string) {
  if (response.ok) return;
  const detail = await response.text();
  throw new Error(`${providerName} OTP request failed (${response.status}): ${detail.slice(0, 300)}`);
}

export async function sendOtp(phone: string, requestIp: string) {
  const selected = provider();
  if (selected === "development") {
    if (process.env.NODE_ENV === "production") throw new Error("Development OTP is disabled in production");
    const code = process.env.DEV_OTP ?? "123456";
    await db.employeeOtp.create({
      data: {
        phone,
        codeHash: await bcrypt.hash(code, 10),
        expiresAt: new Date(Date.now() + 5 * 60_000),
        requestIp,
      },
    });
    return;
  }

  if (selected === "supabase") {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required");
    const response = await fetch(`${url}/auth/v1/otp`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    await expectProviderSuccess(response, "Supabase");
    return;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!accountSid || !authToken || !serviceSid) throw new Error("Twilio Verify environment variables are required");
  const response = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: phone, Channel: "sms" }),
  });
  await expectProviderSuccess(response, "Twilio");
}

export async function verifyOtp(phone: string, code: string) {
  const selected = provider();
  if (selected === "development") {
    if (process.env.NODE_ENV === "production") throw new Error("Development OTP is disabled in production");
    const record = await db.employeeOtp.findFirst({
      where: { phone, expiresAt: { gt: new Date() }, verifiedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!record || record.attempts >= 5) return false;
    if (!(await bcrypt.compare(code, record.codeHash))) {
      await db.employeeOtp.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      return false;
    }
    await db.employeeOtp.update({ where: { id: record.id }, data: { verifiedAt: new Date() } });
    return true;
  }

  if (selected === "supabase") {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required");
    const response = await fetch(`${url}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ phone, token: code, type: "sms" }),
    });
    return response.ok;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!accountSid || !authToken || !serviceSid) throw new Error("Twilio Verify environment variables are required");
  const response = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: phone, Code: code }),
  });
  if (!response.ok) return false;
  const result = (await response.json()) as { status?: string };
  return result.status === "approved";
}
