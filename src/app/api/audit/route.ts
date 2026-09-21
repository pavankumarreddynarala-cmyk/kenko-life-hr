import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

// Optional filters: ?recordType=FixedAsset&recordId=<id> returns one record's full trail
// (used by the deletion-history "View details" panels); ?limit= caps the rows (max 500).
export async function GET(req: NextRequest) {
  try {
    requireRole(req, MANAGEMENT_ROLES);
    const params = req.nextUrl.searchParams;
    const recordType = params.get("recordType")?.trim();
    const recordId = params.get("recordId")?.trim();
    const limit = Math.min(Math.max(Number(params.get("limit")) || 500, 1), 500);
    const data = await db.auditLog.findMany({
      where: { ...(recordType ? { recordType } : {}), ...(recordId ? { recordId } : {}) },
      take: limit,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error, "Loading the audit history");
  }
}
