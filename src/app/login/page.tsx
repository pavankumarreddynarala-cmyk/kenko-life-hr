import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/server-session";
import { isManagementRole } from "@/lib/permissions";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const session = await getServerSession();
  if (session && isManagementRole(session.role)) redirect("/dashboard");
  const { reason } = await searchParams;
  return <LoginForm reason={reason} />;
}
