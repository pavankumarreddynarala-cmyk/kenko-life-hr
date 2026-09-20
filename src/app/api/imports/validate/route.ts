import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { parseWorkbook, validateImportRows, type RowError } from "@/lib/imports";
import { apiError } from "@/lib/api-error";

async function checkDuplicates(type: "employees" | "assets", candidates: string[]): Promise<Set<string>> {
  if (!candidates.length) return new Set();
  if (type === "employees") {
    const phones = candidates.filter((c) => c.startsWith("phone:")).map((c) => c.slice("phone:".length));
    const emails = candidates.filter((c) => c.startsWith("email:")).map((c) => c.slice("email:".length));
    const found = await db.employee.findMany({
      where: {
        OR: [
          ...(phones.length ? [{ phone: { in: phones } }] : []),
          ...(emails.length ? [{ email: { in: emails, mode: "insensitive" as const } }] : []),
        ],
      },
      select: { phone: true, email: true },
    });
    const set = new Set<string>();
    for (const row of found) {
      if (row.phone && phones.includes(row.phone)) set.add(`phone:${row.phone.toLowerCase()}`);
      if (row.email && emails.includes(row.email.toLowerCase())) set.add(`email:${row.email.toLowerCase()}`);
    }
    return set;
  }
  const faIds = candidates.filter((c) => c.startsWith("faId:")).map((c) => c.slice("faId:".length));
  const found = await db.fixedAsset.findMany({ where: { faId: { in: faIds, mode: "insensitive" } } as never, select: { faId: true } });
  return new Set(found.map((row) => `faId:${row.faId.toLowerCase()}`));
}

export async function POST(req: NextRequest) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const form = await req.formData();
    const type = String(form.get("type") ?? "");
    if (type !== "employees" && type !== "assets") return NextResponse.json({ error: "type must be employees or assets" }, { status: 400 });
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "A file is required" }, { status: 400 });

    const rows = await parseWorkbook(await file.arrayBuffer());
    if (!rows.length) return NextResponse.json({ error: "The file has no data rows" }, { status: 400 });

    const { validRows, errors, totalRows } = await validateImportRows(type, rows, {
      checkDuplicates: (candidates) => checkDuplicates(type, candidates),
    });

    const batch = await db.importBatch.create({
      data: {
        type,
        status: validRows.length ? "READY" : "FAILED",
        filename: file.name,
        totalRows,
        validCount: validRows.length,
        errorCount: errors.length,
        payload: validRows as never,
        createdBy: session.userId,
        errors: { create: errors.slice(0, 500).map((error: RowError) => ({ rowNumber: error.rowNumber, field: error.field, message: error.message, raw: error.raw as never })) },
      },
    });

    await audit({
      actorId: session.userId,
      email: session.email,
      role: session.role,
      module: "IMPORT",
      recordType: "ImportBatch",
      recordId: batch.id,
      action: "VALIDATED",
      metadata: { type, filename: file.name, totalRows, validCount: validRows.length, errorCount: errors.length },
    });

    return NextResponse.json({
      data: {
        batchId: batch.id,
        status: batch.status,
        totalRows,
        validCount: validRows.length,
        errorCount: errors.length,
        errors: errors.slice(0, 200),
      },
    });
  } catch (error) {
    return apiError(error, "Unable to validate the file");
  }
}
