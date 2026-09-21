"use client";

import { createContext, ReactNode, useContext } from "react";
import type { Permissions } from "@/lib/permissions";

export type SessionUser = {
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  portal: "management" | "employee";
  permissions: Permissions;
  employeeCode?: string;
};

const SessionContext = createContext<SessionUser | null>(null);

export function SessionProvider({ user, children }: { user: SessionUser; children: ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

/** The signed-in person and what their role may do. Only valid inside a portal layout. */
export function useSessionUser(): SessionUser {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSessionUser must be used inside a portal layout");
  return value;
}
