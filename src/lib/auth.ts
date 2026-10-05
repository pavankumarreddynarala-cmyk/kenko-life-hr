import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
export type Session = { userId: string; email: string; role: Role; employeeId?: string };
const secret = () => process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? (() => { throw new Error("JWT_SECRET required"); })() : "development-only-secret-change-me");
export function signSession(data: Session) { return jwt.sign(data, secret(), { expiresIn: "8h" }); }
export function getSession(request: NextRequest): Session | null { try { const token = request.cookies.get("kenko_session")?.value; return token ? jwt.verify(token, secret()) as Session : null; } catch { return null; } }
export function readSessionToken(token?: string): Session | null { try { return token ? jwt.verify(token, secret()) as Session : null; } catch { return null; } }
export function signEmailVerification(email: string, subject: string) { return jwt.sign({ email, subject, purpose: "email_verification" }, secret(), { expiresIn: "15m" }); }
export function getVerifiedEmail(request: NextRequest) { try { const token = request.cookies.get("kenko_email_verified")?.value; if (!token) return null; const value = jwt.verify(token, secret()) as { email?: string; subject?: string; purpose?: string }; return value.purpose === "email_verification" && value.subject && value.email ? { email: value.email, subject: value.subject } : null; } catch { return null; } }
export function requireRole(request: NextRequest, roles: Role[]) { const session = getSession(request); if (!session) throw new Error("UNAUTHENTICATED"); if (!roles.includes(session.role)) throw new Error("FORBIDDEN"); return session; }
export function requireEmployeeOwnership(request: NextRequest, employeeId: string) { const session = getSession(request); if (!session) throw new Error("UNAUTHENTICATED"); if (session.role === "EMPLOYEE" && session.employeeId !== employeeId) throw new Error("FORBIDDEN"); return session; }

/** R1: the only account allowed to create or reset logins. Configurable, defaults to pavan@thekenkolife.com. */
export const superAdminEmail = () => (process.env.SUPER_ADMIN_EMAIL || "pavan@thekenkolife.com").trim().toLowerCase();
export const isSuperAdmin = (session: Session | null) => !!session && session.role === "ADMIN" && session.email.toLowerCase() === superAdminEmail();
export function requireSuperAdmin(request: NextRequest) { const session = requireRole(request, ["ADMIN"]); if (!isSuperAdmin(session)) throw new Error("FORBIDDEN"); return session; }
