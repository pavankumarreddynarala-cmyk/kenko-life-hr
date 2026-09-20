import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";

const valueSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,20}$/),
});

// Adds one coded value under an existing custom master type (e.g. under "Shift Type":
// code "NIGHT", name "Night Shift"). This is what lets an admin grow a custom master's
// value list over time without any code change.
export async function POST(req: NextRequest, { params }: { params: Promise<{ typeId: string }> }) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const { typeId } = await params;
    const parsed = valueSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "A name and an uppercase unique code are required" }, { status: 400 });

    const created = await db.$transaction(async (tx) => {
      const type = await tx.customMasterType.findUnique({ where: { id: typeId } });
      if (!type) throw new Error("Master type not found");
      const value = await tx.customMasterValue.create({ data: { ...parsed.data, typeId } });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "ORGANISATION",
          recordType: "CustomMasterValue",
          recordId: value.id,
          action: "MASTER_VALUE_CREATED",
          newValue: value,
          metadata: { typeId, typeName: type.name },
        },
        tx,
      );
      return value;
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add value";
    return NextResponse.json(
      { error: message === "Master type not found" ? message : message === "FORBIDDEN" ? "Management access required" : "That name or code already exists under this master" },
      { status: message === "Master type not found" ? 404 : message === "FORBIDDEN" ? 403 : 409 },
    );
  }
}
