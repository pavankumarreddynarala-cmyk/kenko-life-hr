import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { loadAssetForScan, tokenFromScan, viewerFor } from "@/lib/asset-view";

// R14: role-based, live (uncached) asset lookup for a scanned QR code.
// ADMIN gets every group. Everyone else (HR, CFO, employees) gets Group 1, Group 2 and the custodian.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const noStore = { "Cache-Control": "no-store, max-age=0" };
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Please sign in to scan assets" }, { status: 401, headers: noStore });
  const { token: raw } = await params;
  const token = tokenFromScan(decodeURIComponent(raw));
  if (!token) return NextResponse.json({ error: "This is not a Kenko asset QR code" }, { status: 400, headers: noStore });
  const viewer = viewerFor(session.role);
  const result = await loadAssetForScan(token, viewer);
  if (!result) return NextResponse.json({ error: "No asset found for this QR code" }, { status: 404, headers: noStore });
  await audit({ actorId: session.userId, email: session.email, role: session.role, module: "ASSET", recordType: "AssetQRCode", recordId: token, action: "QR_SCANNED", metadata: { viewer } }).catch(() => undefined);
  return NextResponse.json({ data: result }, { headers: noStore });
}
