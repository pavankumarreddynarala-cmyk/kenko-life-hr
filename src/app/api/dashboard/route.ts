import { NextRequest, NextResponse } from "next/server";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { loadDashboard } from "@/lib/dashboard";
import { apiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    requireRole(req, MANAGEMENT_ROLES);
    return NextResponse.json({ data: await loadDashboard() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Loading the dashboard");
  }
}
