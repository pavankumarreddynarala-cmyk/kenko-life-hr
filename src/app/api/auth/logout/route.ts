import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isManagementRole } from "@/lib/permissions";

// Always succeeds: even if the session already lapsed, the cookie is cleared so the
// browser lands on the sign-in page cleanly. `reason: "inactivity"` marks the automatic
// 5-minute timeout in the audit log.
export async function POST(req: NextRequest) {
  const session = getSession(req);
  const body = await req.json().catch(() => ({}));
  const inactivity = body?.reason === "inactivity";
  const response = NextResponse.json({
    ok: true,
    redirectTo: session && !isManagementRole(session.role) ? "/employee/login" : "/login",
  });
  clearSessionCookie(response);
  if (session) {
    try {
      await audit({
        actorId: session.userId,
        email: session.email,
        role: session.role,
        module: "AUTH",
        recordType: "User",
        recordId: session.userId,
        action: inactivity ? "SESSION_TIMEOUT" : "LOGOUT",
      });
    } catch (error) {
      console.error("Could not record sign-out in the audit log", error);
    }
  }
  return response;
}
