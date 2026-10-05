import { NextRequest, NextResponse } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  return NextResponse.json({
    email: session.email,
    role: session.role,
    // Drives whether the "Logins" menu is shown. The server re-checks on every users call.
    canManageLogins: isSuperAdmin(session),
  });
}
