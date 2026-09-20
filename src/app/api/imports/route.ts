import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    requireRole(req, MANAGEMENT_ROLES);
    const data = await db.importBatch.findMany({
      select: { id: true, type: true, status: true, filename: true, totalRows: true, validCount: true, errorCount: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error, "Unable to load import history");
  }
}
