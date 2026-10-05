import { redirect } from "next/navigation";
import { getVendorSessionServer } from "@/lib/vendor-auth";
import { VendorHome } from "./vendor-home";

export const dynamic = "force-dynamic";

export default async function VendorPage() {
  if (!(await getVendorSessionServer())) redirect("/vendor/login");
  return <VendorHome />;
}
