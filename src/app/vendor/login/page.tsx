import { redirect } from "next/navigation";
import { getVendorSessionServer } from "@/lib/vendor-auth";
import { VendorLogin } from "./vendor-login";

export const dynamic = "force-dynamic";

export default async function VendorLoginPage() {
  if (await getVendorSessionServer()) redirect("/vendor");
  return <VendorLogin />;
}
