import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { unauthenticated } from "@/lib/app-error";

export const VENDOR_COOKIE = "kenko_vendor";
export const VENDOR_SESSION_SECONDS = 15 * 60;
export type VendorSession = { vendorId: string; email: string };

const secret = () =>
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === "production"
    ? (() => {
        throw new Error("JWT_SECRET required");
      })()
    : "development-only-secret-change-me");

const read = (token?: string): VendorSession | null => {
  try {
    if (!token) return null;
    const value = jwt.verify(token, secret()) as { vendorId?: string; email?: string; purpose?: string };
    return value.purpose === "vendor" && value.vendorId && value.email ? { vendorId: value.vendorId, email: value.email } : null;
  } catch {
    return null;
  }
};

export function setVendorCookie(response: NextResponse, session: VendorSession) {
  response.cookies.set(VENDOR_COOKIE, jwt.sign({ ...session, purpose: "vendor" }, secret(), { expiresIn: VENDOR_SESSION_SECONDS }), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: VENDOR_SESSION_SECONDS,
    path: "/",
  });
}

export function clearVendorCookie(response: NextResponse) {
  response.cookies.set(VENDOR_COOKIE, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 0, path: "/" });
}

export function getVendorSession(request: NextRequest) {
  return read(request.cookies.get(VENDOR_COOKIE)?.value);
}

export function requireVendor(request: NextRequest) {
  const session = getVendorSession(request);
  if (!session) throw unauthenticated();
  return session;
}

export async function getVendorSessionServer() {
  return read((await cookies()).get(VENDOR_COOKIE)?.value);
}
