import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => {
    const entities: Record<string, string> = { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" };
    return entities[character];
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    requireRole(req, ["ADMIN", "HR", "CFO"]);
    const { token } = await params;
    const record = await db.assetQRCode.findUnique({ where: { token }, include: { asset: true } });
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const url = new URL(`/qr/${token}`, req.url).toString();
    const dataUrl = await QRCode.toDataURL(url, {
      width: 512,
      margin: 2,
      color: { dark: "#1E2C22", light: "#FFFFFF" },
    });
    const assetId = escapeXml(record.asset.faId);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="620" viewBox="0 0 560 620">
  <rect width="560" height="620" rx="24" fill="#fff"/>
  <image href="${dataUrl}" x="24" y="24" width="512" height="512"/>
  <text x="280" y="575" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#1E2C22">${assetId}</text>
  <text x="280" y="602" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#4F7B38">THE KENKO LIFE ASSET</text>
</svg>`;
    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "private, max-age=3600",
        ...(download ? { "Content-Disposition": `attachment; filename="${record.asset.faId}-qr.svg"` } : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
