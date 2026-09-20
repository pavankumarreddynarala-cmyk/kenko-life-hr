import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => {
    const entities: Record<string, string> = { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" };
    return entities[character];
  });
}

// Bulk-downloads every asset's printable QR label as one ZIP of individually named SVGs
// (<AssetID>-qr.svg), for first-time tagging or replacing worn labels in one pass.
export async function GET(req: NextRequest) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const assets = await db.fixedAsset.findMany({
      where: { qr: { isNot: null } },
      select: { faId: true, qr: { select: { token: true } } },
      orderBy: { faId: "asc" },
    });

    const zip = new JSZip();
    for (const asset of assets) {
      if (!asset.qr) continue;
      const url = new URL(`/qr/${asset.qr.token}`, req.url).toString();
      const dataUrl = await QRCode.toDataURL(url, {
        width: 512,
        margin: 2,
        color: { dark: "#1E2C22", light: "#FFFFFF" },
      });
      const assetId = escapeXml(asset.faId);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="620" viewBox="0 0 560 620">
  <rect width="560" height="620" rx="24" fill="#fff"/>
  <image href="${dataUrl}" x="24" y="24" width="512" height="512"/>
  <text x="280" y="575" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#1E2C22">${assetId}</text>
  <text x="280" y="602" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#4F7B38">THE KENKO LIFE ASSET</text>
</svg>`;
      zip.file(`${asset.faId}-qr.svg`, svg);
    }

    const buffer = await zip.generateAsync({ type: "blob" });
    await audit({
      actorId: session.userId,
      email: session.email,
      role: session.role,
      module: "ASSET",
      recordType: "AssetQRCode",
      recordId: "bulk",
      action: "QR_BULK_DOWNLOADED",
      metadata: { assetCount: assets.length },
    });
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="kenko-asset-qr-codes.zip"',
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
