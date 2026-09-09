import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
export type Session = { userId: string; email: string; role: Role; employeeId?: string };
const secret = () => process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? (() => { throw new Error("JWT_SECRET required"); })() : "development-only-secret-change-me");
export function signSession(data: Session) { return jwt.sign(data, secret(), { expiresIn: "8h" }); }
export function getSession(request: NextRequest): Session | null { try { const token = request.cookies.get("kenko_session")?.value; return token ? jwt.verify(token, secret()) as Session : null; } catch { return null; } }
export function readSessionToken(token?: string): Session | null { try { return token ? jwt.verify(token, secret()) as Session : null; } catch { return null; } }
export function signPhoneVerification(phone: string) { return jwt.sign({ phone, purpose: "phone_verification" }, secret(), { expiresIn: "15m" }); }
export function getVerifiedPhone(request: NextRequest) { try { const token = request.cookies.get("kenko_phone_verified")?.value; if (!token) return null; const value = jwt.verify(token, secret()) as { phone?: string; purpose?: string }; return value.purpose === "phone_verification" && value.phone ? value.phone : null; } catch { return null; } }
export function requireRole(request: NextRequest, roles: Role[]) { const session = getSession(request); if (!session) throw new Error("UNAUTHENTICATED"); if (!roles.includes(session.role)) throw new Error("FORBIDDEN"); return session; }
export function requireEmployeeOwnership(request: NextRequest, employeeId: string) { const session = getSession(request); if (!session) throw new Error("UNAUTHENTICATED"); if (session.role === "EMPLOYEE" && session.employeeId !== employeeId) throw new Error("FORBIDDEN"); return session; }
