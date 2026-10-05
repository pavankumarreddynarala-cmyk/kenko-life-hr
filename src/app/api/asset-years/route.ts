import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MANAGEMENT_ROLES, PRIVILEGED_ROLES, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError } from "@/lib/api-error";
import { AppError } from "@/lib/app-error";
import { FIRST_FY, currentFy, fyLabel } from "@/lib/depreciation-engine";

const KEY = "assetYearsExtra";
async function extraYears() {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  const n = Number((row?.value as { count?: number } | null)?.count ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.trunc(n), 30) : 0;
}
function listYears(extra: number) {
  const last = currentFy() + extra;
  return Array.from({ length: last - FIRST_FY + 1 }, (_, i) => ({ fy: FIRST_FY + i, label: fyLabel(FIRST_FY + i) }));
}

// R11: 2019 .. the running financial year, plus however many future years have been added.
export async function GET(req: NextRequest) {
  try {
    requireRole(req, MANAGEMENT_ROLES);
    const extra = await extraYears();
    return NextResponse.json({ currentFy: currentFy(), extra, years: listYears(extra) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Unable to load years");
  }
}

// "Add Next Year": each call appends exactly one more year.
export async function POST(req: NextRequest) {
  try {
    const session = requireRole(req, [...PRIVILEGED_ROLES, "CFO"], "Only an Admin, CEO, COO or CFO can change depreciation settings.");
    const result = await db.$transaction(async (tx) => {
      const row = await tx.appSetting.findUnique({ where: { key: KEY } });
      const before = Number((row?.value as { count?: number } | null)?.count ?? 0) || 0;
      if (before >= 30) throw new AppError("The year list cannot be extended further.", { status: 400, code: "YEAR_LIMIT" });
      const next = before + 1;
      await tx.appSetting.upsert({ where: { key: KEY }, update: { value: { count: next } }, create: { key: KEY, value: { count: next } } });
      await audit({ actorId: session.userId, email: session.email, role: session.role, module: "ASSET", recordType: "AppSetting", recordId: KEY, action: "YEAR_ADDED", previousValue: { count: before }, newValue: { count: next } }, tx);
      return next;
    });
    return NextResponse.json({ currentFy: currentFy(), extra: result, years: listYears(result) }, { status: 201 });
  } catch (error) {
    return apiError(error, "Unable to add year");
  }
}
