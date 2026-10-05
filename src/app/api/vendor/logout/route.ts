import { NextResponse } from "next/server";
import { clearVendorCookie } from "@/lib/vendor-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearVendorCookie(response);
  return response;
}
