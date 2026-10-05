import { VendorApply } from "./vendor-apply";

export const dynamic = "force-dynamic";

export default async function VendorApplyPage({ params }: { params: Promise<{ token: string }> }) {
  return <VendorApply token={(await params).token} />;
}
