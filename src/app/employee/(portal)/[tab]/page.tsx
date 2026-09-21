import { notFound } from "next/navigation";
import { EmployeeWorkspace } from "@/components/employee-workspace";
import { isEmployeeTab } from "@/lib/employee-tabs";

// /employee/employment, /employee/bank, /employee/assets, /employee/requests
export default async function EmployeeTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  if (!isEmployeeTab(tab)) notFound();
  return <EmployeeWorkspace tab={tab} />;
}
