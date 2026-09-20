import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError } from "@/lib/api-error";

const typeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/),
});

// Lists every custom master type together with its values, for the Master Data page's
// "Custom" section and for any future dropdown that wants to consume them.
export async function GET(req: NextRequest) {
  try {
    requireRole(req, MANAGEMENT_ROLES);
    const data = await db.customMasterType.findMany({
      include: { values: { orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error, "Unable to load custom master types");
  }
}

// Creates a brand new master category (e.g. "Shift Type", code "SHIFT") with no values
// yet. Values are added afterwards via POST /api/masters/custom/[typeId]/values.
export async function POST(req: NextRequest) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const parsed = typeSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "A name and an uppercase unique code are required" }, { status: 400 });
    const created = await db.$transaction(async (tx) => {
      const type = await tx.customMasterType.create({ data: parsed.data });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "ORGANISATION",
          recordType: "CustomMasterType",
          recordId: type.id,
          action: "MASTER_TYPE_CREATED",
          newValue: type,
        },
        tx,
      );
      return type;
    });
    return NextResponse.json({ data: { ...created, values: [] } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create master";
    return NextResponse.json({ error: message === "FORBIDDEN" ? "Management access required" : "That master name or code already exists" }, { status: message === "FORBIDDEN" ? 403 : 409 });
  }
}
