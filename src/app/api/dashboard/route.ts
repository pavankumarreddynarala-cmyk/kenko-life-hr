import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

// Real, live counts for the dashboard. Nothing here is sample data.
export async function GET(req: NextRequest) {
  try {
    requireRole(req, ["ADMIN", "HR", "CFO"]);
    const since30 = new Date(Date.now() - 30 * 86_400_000);
    const yearAgo = new Date(Date.now() - 365 * 86_400_000);
    const [employees, activeEmployees, joinedRecently, assets, assigned, pendingTransfers, exitedHolding, notVerified, noCapDate, unverifiedMasters, activity] = await Promise.all([
      db.employee.count(),
      db.employee.count({ where: { status: "ACTIVE" } }),
      db.employee.count({ where: { createdAt: { gte: since30 } } }),
      db.fixedAsset.count({ where: { status: { not: "DISPOSED" } } }),
      db.fixedAsset.count({ where: { status: "ASSIGNED" } }),
      db.assetTransfer.count({ where: { status: "PENDING" } }),
      db.employee.count({ where: { status: "EXITED", assignments: { some: { returnedAt: null } } } }),
      db.fixedAsset.count({ where: { status: { not: "DISPOSED" }, OR: [{ verificationDate: null }, { verificationDate: { lt: yearAgo } }] } }),
      db.fixedAsset.count({ where: { status: { not: "DISPOSED" }, capitalisationDate: null } }),
      Promise.all([db.assetCategory.count({ where: { verified: false } }), db.taxBlock.count({ where: { verified: false } })]).then(([a, b]) => a + b),
      db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, action: true, module: true, recordType: true, email: true, createdAt: true } }),
    ]);
    return NextResponse.json(
      { employees, activeEmployees, joinedRecently, assets, assigned, pendingTransfers, exitedHolding, notVerified, noCapDate, unverifiedMasters, activity },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error, "Unable to load dashboard");
  }
}
