import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell";
import { getServerSession, hadSessionCookie, loadSessionUser } from "@/lib/server-session";
import { isManagementRole } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// Every Management page (dashboard, employee master, assets, …) sits behind this guard:
// no session -> management sign-in; an employee session -> the Employee Portal instead.
export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect((await hadSessionCookie()) ? "/login?reason=expired" : "/login");
  if (!isManagementRole(session.role)) redirect("/employee");
  const user = await loadSessionUser(session);
  if (!user) redirect("/login?reason=expired");
  return <AppShell user={user}>{children}</AppShell>;
}
