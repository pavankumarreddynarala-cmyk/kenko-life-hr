import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { forbidden, unauthenticated } from "@/lib/app-error";
import { MANAGEMENT_ROLE_NAMES, PRIVILEGED_ROLE_NAMES } from "@/lib/permissions";

export type Session = { userId: string; email: string; role: Role; employeeId?: string };

// ADMIN, CEO, COO, HR and CFO all sign in through the Management portal. ADMIN, CEO and
// COO additionally hold the privileged actions listed in permissions.ts. EMPLOYEE is the
// only restricted role (Employee Portal, own data only).
export const MANAGEMENT_ROLES: Role[] = [...MANAGEMENT_ROLE_NAMES] as Role[];
export const PRIVILEGED_ROLES: Role[] = [...PRIVILEGED_ROLE_NAMES] as Role[];

// Inactivity policy: the browser signs the user out after 5 idle minutes (with a warning
// beforehand). The server enforces the same limit independently: the session cookie only
// lives 6 minutes and is renewed by POST /api/auth/session when the user is active.
export const SESSION_IDLE_SECONDS = 5 * 60;
export const SESSION_TOKEN_SECONDS = 6 * 60;
export const SESSION_COOKIE = "kenko_session";

const secret = () =>
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === "production"
    ? (() => {
        throw new Error("JWT_SECRET required");
      })()
    : "development-only-secret-change-me");

export function signSession(data: Session) {
  const { userId, email, role, employeeId } = data;
  return jwt.sign({ userId, email, role, ...(employeeId ? { employeeId } : {}) }, secret(), {
    expiresIn: SESSION_TOKEN_SECONDS,
  });
}

export function setSessionCookie(response: NextResponse, session: Session) {
  response.cookies.set(SESSION_COOKIE, signSession(session), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TOKEN_SECONDS,
    path: "/",
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
}

export function readSessionToken(token?: string): Session | null {
  try {
    return token ? (jwt.verify(token, secret()) as Session) : null;
  } catch {
    return null;
  }
}

export function getSession(request: NextRequest): Session | null {
  return readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
}

export function signEmailVerification(email: string) {
  return jwt.sign({ email, purpose: "email_verification" }, secret(), { expiresIn: "15m" });
}

export function getVerifiedEmail(request: NextRequest) {
  try {
    const token = request.cookies.get("kenko_email_verified")?.value;
    if (!token) return null;
    const value = jwt.verify(token, secret()) as { email?: string; purpose?: string };
    return value.purpose === "email_verification" && value.email ? value.email : null;
  } catch {
    return null;
  }
}

export function requireRole(request: NextRequest, roles: Role[], deniedMessage?: string) {
  const session = getSession(request);
  if (!session) throw unauthenticated();
  if (!roles.includes(session.role)) throw forbidden(deniedMessage);
  return session;
}

export function requireEmployeeOwnership(request: NextRequest, employeeId: string) {
  const session = getSession(request);
  if (!session) throw unauthenticated();
  if (session.role === "EMPLOYEE" && session.employeeId !== employeeId) {
    throw forbidden("You can only view and change your own employee record.");
  }
  return session;
}
