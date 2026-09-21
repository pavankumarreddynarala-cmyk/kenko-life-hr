import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell";
import { getServerSession, hadSessionCookie, loadSessionUser } from "@/lib/server-session";

export const dynamic = "force-dynamic";

// The Employee Portal proper (profile, assets, requests). Anyone without an employee
// session is sent to /employee/login; management accounts have their own portal.
export default async function EmployeePortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect((await hadSessionCookie()) ? "/employee/login?reason=expired" : "/employee/login");
  if (session.role !== "EMPLOYEE") redirect("/employee/login");
  const user = await loadSessionUser(session);
  if (!user) redirect("/employee/login?reason=expired");
  return <AppShell user={user}>{children}</AppShell>;
}
