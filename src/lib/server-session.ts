import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { readSessionToken, SESSION_COOKIE, type Session } from "@/lib/auth";
import { isManagementRole, nameFromEmail, permissionsFor, roleLabel } from "@/lib/permissions";
import type { SessionUser } from "@/components/session-context";

export async function getServerSession(): Promise<Session | null> {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
}

/** True when the browser still sends a session cookie (even an expired/invalid one). */
export async function hadSessionCookie(): Promise<boolean> {
  const store = await cookies();
  return Boolean(store.get(SESSION_COOKIE)?.value);
}

/**
 * Loads what the sidebar shows for the signed-in person. Returns null when the account
 * no longer exists (for example a deleted employee), so the caller can send them to sign in.
 */
export async function loadSessionUser(session: Session): Promise<SessionUser | null> {
  if (isManagementRole(session.role)) {
    const user = await db.user.findUnique({ where: { id: session.userId }, select: { name: true, email: true } });
    if (!user) return null;
    return {
      name: user.name || nameFromEmail(user.email),
      email: user.email,
      role: session.role,
      roleLabel: roleLabel(session.role),
      portal: "management",
      permissions: permissionsFor(session.role),
    };
  }
  if (!session.employeeId) return null;
  const employee = await db.employee.findUnique({
    where: { id: session.employeeId },
    select: { name: true, email: true, permanentId: true, deletedAt: true },
  });
  if (!employee || employee.deletedAt) return null;
  return {
    name: employee.name,
    email: employee.email ?? session.email,
    role: "EMPLOYEE",
    roleLabel: roleLabel("EMPLOYEE"),
    portal: "employee",
    permissions: permissionsFor("EMPLOYEE"),
    employeeCode: employee.permanentId,
  };
}
