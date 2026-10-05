import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DOCUMENT_ROLES, requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    requireRole(req, DOCUMENT_ROLES, "Only an Admin, CEO, COO or HR can see the letter history.");
    const data = await db.letterLog.findMany({
      select: { id: true, templateName: true, letterType: true, employeeCode: true, employeeName: true, action: true, sentTo: true, actorEmail: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Loading the letter history");
  }
}
