import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    requireRole(req, MANAGEMENT_ROLES);
    return NextResponse.json({ data: await db.auditLog.findMany({ take: 500, orderBy: { createdAt: "desc" } }) });
  } catch (error) {
    return apiError(error, "Unable to load audit history");
  }
}
