import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/server-session";
import { EmployeeLoginForm } from "./employee-login-form";

export const dynamic = "force-dynamic";

export default async function EmployeeLoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const session = await getServerSession();
  if (session?.role === "EMPLOYEE") redirect("/employee");
  const { reason } = await searchParams;
  return <EmployeeLoginForm reason={reason} />;
}
