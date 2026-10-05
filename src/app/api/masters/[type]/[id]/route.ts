import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { isMasterType } from "@/lib/masters";
import { apiError } from "@/lib/api-error";

type Row = { id: string; name: string; code: string; active?: boolean };
type Delegate = {
  findUnique: (args: { where: { id: string } }) => Promise<Row | null>;
  update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<Row>;
};

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/).optional(),
  active: z.boolean().optional(),
});

// R9: edit any master entry; companies can also be deactivated (never hard-deleted, so existing
// employees and assets keep their company). Inactive companies drop out of new-record dropdowns.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  try {
    const session = requireRole(req, ["ADMIN"]);
    const { type, id } = await params;
    if (!isMasterType(type)) return NextResponse.json({ error: "Unknown master" }, { status: 404 });
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "A valid name and uppercase code are required" }, { status: 400 });
    if (parsed.data.active !== undefined && type !== "company") {
      return NextResponse.json({ error: "Only companies can be deactivated" }, { status: 400 });
    }
    const updated = await db.$transaction(async (tx) => {
      const delegate = (tx as unknown as Record<string, Delegate>)[type];
      const before = await delegate.findUnique({ where: { id } });
      if (!before) throw new Error("NOT_FOUND");
      const after = await delegate.update({ where: { id }, data: parsed.data });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "ORGANISATION",
          recordType: type,
          recordId: id,
          action: parsed.data.active === false ? "MASTER_DEACTIVATED" : parsed.data.active === true ? "MASTER_ACTIVATED" : "MASTER_UPDATED",
          previousValue: before,
          newValue: after,
        },
        tx,
      );
      return after;
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "That name or code already exists" }, { status: 409 });
    }
    return apiError(error, "Unable to update master data");
  }
}
