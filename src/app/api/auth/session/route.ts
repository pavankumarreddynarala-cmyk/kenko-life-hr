import { NextRequest, NextResponse } from "next/server";
import { getSession, setSessionCookie, SESSION_IDLE_SECONDS } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { unauthenticated } from "@/lib/app-error";

// Heartbeat: the browser calls this while the user is actively working. It re-issues the
// short-lived session cookie, which is how the 5-minute inactivity limit is enforced on
// the server as well as in the browser. Nothing else renews the session, so a page that
// merely polls in the background cannot keep an unattended session alive.
export async function POST(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session) throw unauthenticated();
    const response = NextResponse.json({ ok: true, idleSeconds: SESSION_IDLE_SECONDS });
    setSessionCookie(response, {
      userId: session.userId,
      email: session.email,
      role: session.role,
      employeeId: session.employeeId,
    });
    return response;
  } catch (error) {
    return apiError(error, "Renewing your session");
  }
}
