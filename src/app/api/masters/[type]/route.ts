import { NextRequest, NextResponse } from "next/server";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { describeUsage, isMasterType, masterDefinitions, masterSingular, usageCountSelect } from "@/lib/masters";
import { masterSchema } from "@/lib/master-schema";
import { apiError, validationError } from "@/lib/api-error";
import { AppError } from "@/lib/app-error";

type Row = { id: string; name: string; code: string; _count?: Record<string, number> };
type Delegate = {
  findMany: (args: { orderBy: { name: "asc" }; include?: unknown }) => Promise<Row[]>;
  findFirst: (args: unknown) => Promise<Row | null>;
  create: (args: { data: { name: string; code: string } }) => Promise<Row>;
};

function unknownMaster(type: string) {
  return new AppError(`"${type}" is not a known master. Choose a master from the list on the left.`, { status: 404, code: "NOT_FOUND" });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  try {
    requireRole(req, MANAGEMENT_ROLES);
    const { type } = await params;
    if (!isMasterType(type)) throw unknownMaster(type);
    const rows = await (masterDefinitions[type].delegate as unknown as Delegate).findMany({
      orderBy: { name: "asc" },
      include: usageCountSelect(type),
    });
    const data = rows.map(({ _count, ...row }) => ({ ...row, usage: describeUsage(type, _count) }));
    return NextResponse.json({ data, label: masterDefinitions[type].label });
  } catch (error) {
    return apiError(error, "Loading master data");
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const { type } = await params;
    if (!isMasterType(type)) throw unknownMaster(type);
    const payload = masterSchema.safeParse(await req.json());
    if (!payload.success) return validationError(payload.error);
    const singular = masterSingular[type];

    const created = await db.$transaction(async (tx) => {
      const delegate = (tx as unknown as Record<string, Delegate>)[type];
      const clash = await delegate.findFirst({
        where: { OR: [{ name: { equals: payload.data.name, mode: "insensitive" } }, { code: payload.data.code }] },
      });
      if (clash) {
        const field = clash.code === payload.data.code ? "code" : "name";
        throw new AppError(
          `A ${singular} named “${clash.name}” with code ${clash.code} already exists. Enter a different ${field}, or edit the existing entry instead.`,
          { status: 409, code: "DUPLICATE_VALUE", fields: [{ field, label: field === "code" ? "Code" : "Name", message: `This ${field} is already used by “${clash.name}” (${clash.code}).` }] },
        );
      }
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
    return apiError(error, "Adding the master entry");
  }
}
