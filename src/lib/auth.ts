import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
export type Session = { userId: string; email: string; role: Role; employeeId?: string };
// ADMIN, CEO, COO, HR and CFO are aliases with identical, full management permissions.
// EMPLOYEE is the only restricted role (Employee Portal, own data only).
export const MANAGEMENT_ROLES: Role[] = ["ADMIN", "CEO", "COO", "HR", "CFO"];
const secret = () => process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? (() => { throw new Error("JWT_SECRET required"); })() : "development-only-secret-change-me");
export function signSession(data: Session) { return jwt.sign(data, secret(), { expiresIn: "8h" }); }
export function getSession(request: NextRequest): Session | null { try { const token = request.cookies.get("kenko_session")?.value; return token ? jwt.verify(token, secret()) as Session : null; } catch { return null; } }
export function readSessionToken(token?: string): Session | null { try { return token ? jwt.verify(token, secret()) as Session : null; } catch { return null; } }
export function signEmailVerification(email: string) { return jwt.sign({ email, purpose: "email_verification" }, secret(), { expiresIn: "15m" }); }
export function getVerifiedEmail(request: NextRequest) { try { const token = request.cookies.get("kenko_email_verified")?.value; if (!token) return null; const value = jwt.verify(token, secret()) as { email?: string; purpose?: string }; return value.purpose === "email_verification" && value.email ? value.email : null; } catch { return null; } }
export function requireRole(request: NextRequest, roles: Role[]) { const session = getSession(request); if (!session) throw new Error("UNAUTHENTICATED"); if (!roles.includes(session.role)) throw new Error("FORBIDDEN"); return session; }
export function requireEmployeeOwnership(request: NextRequest, employeeId: string) { const session = getSession(request); if (!session) throw new Error("UNAUTHENTICATED"); if (session.role === "EMPLOYEE" && session.employeeId !== employeeId) throw new Error("FORBIDDEN"); return session; }
