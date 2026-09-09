import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { isMasterType, masterDefinitions } from "@/lib/masters";
import { z } from "zod";
import { apiError } from "@/lib/api-error";
const masterSchema = z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/) });
type Delegate = { findMany: (args: { orderBy: { name: "asc" } }) => Promise<unknown[]>; create: (args: { data: { name: string; code: string } }) => Promise<{ id: string; name: string; code: string }> };
export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) { try { requireRole(req, ["ADMIN", "HR", "CFO"]); const { type } = await params; if (!isMasterType(type)) return NextResponse.json({ error: "Unknown master" }, { status: 404 }); const data = await (masterDefinitions[type].delegate as unknown as Delegate).findMany({ orderBy: { name: "asc" } }); return NextResponse.json({ data, label: masterDefinitions[type].label }); } catch (error) { return apiError(error, "Unable to load master data"); } }
export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  try {
    const session = requireRole(req, ["ADMIN"]);
    const { type } = await params;
    if (!isMasterType(type)) return NextResponse.json({ error: "Unknown master" }, { status: 404 });
    const payload = masterSchema.safeParse(await req.json());
    if (!payload.success) return NextResponse.json({ error: "A name and an uppercase unique code are required" }, { status: 400 });
    const created = await db.$transaction(async (tx) => {
      const delegate = (tx as unknown as Record<string, Delegate>)[type];
      const row = await delegate.create({ data: payload.data });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "ORGANISATION",
          recordType: type,
          recordId: row.id,
          action: "MASTER_CREATED",
          newValue: row,
        },
        tx,
      );
      return row;
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      { error: message === "FORBIDDEN" ? "Administrator access required" : "That name or code already exists" },
      { status: message === "FORBIDDEN" ? 403 : 409 },
    );
  }
}
