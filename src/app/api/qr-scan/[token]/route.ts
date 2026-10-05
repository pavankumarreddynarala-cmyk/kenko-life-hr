import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError } from "@/lib/api-error";
import { AppError, notFound, unauthenticated } from "@/lib/app-error";
import { loadAssetForScan, tokenFromScan, viewerFor } from "@/lib/asset-view";

export const dynamic = "force-dynamic";

// R14: role-based, live (never cached) asset lookup for a scanned QR code, used by the in-portal
// camera scanner. Admin, CEO and COO get every group; everyone else who is signed in (HR, CFO,
// employees) gets Group 1, Group 2 and the custodian only. The restriction happens in the database
// select, so a limited viewer's response never contains a restricted field.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const noStore = { "Cache-Control": "no-store, max-age=0" };
  try {
    const session = getSession(req);
    if (!session) throw unauthenticated();
    const { token: raw } = await params;
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      // Keep the raw value; tokenFromScan rejects anything that is not a valid code.
    }
    const token = tokenFromScan(decoded);
    if (!token) throw new AppError("This is not a Kenko asset QR code. Scan the QR label stuck on the asset.", { status: 400, code: "INVALID_QR" });
    const viewer = viewerFor(session.role);
    const result = await loadAssetForScan(token, viewer);
    if (!result) throw notFound("An asset for this QR code");
    await audit({
      actorId: session.userId,
      email: session.email,
      role: session.role,
      module: "ASSET",
      recordType: "AssetQRCode",
      recordId: token,
      action: "QR_SCANNED",
      metadata: { viewer },
    }).catch(() => undefined);
    return NextResponse.json({ data: result }, { headers: noStore });
  } catch (error) {
    const response = apiError(error, "Scanning the QR code");
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  }
}
