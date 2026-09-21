import { NextRequest, NextResponse } from "next/server";
import { requireRole, MANAGEMENT_ROLES, PRIVILEGED_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  describeUsage,
  dynamicCodeRelation,
  isMasterType,
  masterSingular,
  usageCountSelect,
} from "@/lib/masters";
import { refreshDynamicCodesFor } from "@/lib/employees";
import { masterSchema } from "@/lib/master-schema";
import { apiError, validationError } from "@/lib/api-error";
import { AppError, notFound } from "@/lib/app-error";

type Row = { id: string; name: string; code: string; _count?: Record<string, number> };
type Delegate = {
  findUnique: (args: unknown) => Promise<Row | null>;
  findFirst: (args: unknown) => Promise<Row | null>;
  update: (args: unknown) => Promise<Row>;
  delete: (args: unknown) => Promise<Row>;
};

function unknownMaster(type: string) {
  return new AppError(`"${type}" is not a known master. Choose a master from the list on the left.`, { status: 404, code: "NOT_FOUND" });
}

// Editing a name/code takes effect everywhere the entry is used, since employees and assets
// reference master rows by id. A changed code also re-derives the Organisation Code of every
// employee that uses the entry.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const { type, id } = await params;
    if (!isMasterType(type)) throw unknownMaster(type);
    const parsed = masterSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const singular = masterSingular[type];

    const result = await db.$transaction(
      async (tx) => {
        const delegate = (tx as unknown as Record<string, Delegate>)[type];
        const before = await delegate.findUnique({ where: { id } });
        if (!before) throw notFound(`This ${singular.toLowerCase()}`);
        const clash = await delegate.findFirst({
          where: {
            NOT: { id },
            OR: [{ name: { equals: parsed.data.name, mode: "insensitive" } }, { code: parsed.data.code }],
          },
        });
        if (clash) {
          const field = clash.code === parsed.data.code ? "code" : "name";
          throw new AppError(
            `A ${singular} named “${clash.name}” with code ${clash.code} already exists. Enter a different ${field} so the entries stay unique.`,
            { status: 409, code: "DUPLICATE_VALUE", fields: [{ field, label: field === "code" ? "Code" : "Name", message: `This ${field} is already used by “${clash.name}” (${clash.code}).` }] },
          );
        }
        const after = await delegate.update({ where: { id }, data: parsed.data });
        const relation = dynamicCodeRelation[type];
        const recalculated = relation && before.code !== after.code ? await refreshDynamicCodesFor(tx, relation, id) : 0;
        await audit(
          {
            actorId: session.userId,
            email: session.email,
            role: session.role,
            module: "ORGANISATION",
            recordType: type,
            recordId: id,
            action: "MASTER_UPDATED",
            previousValue: before,
            newValue: after,
            metadata: { employeesRecalculated: recalculated },
          },
          tx,
        );
        return { after, recalculated };
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
    return NextResponse.json({ data: result.after, employeesRecalculated: result.recalculated });
  } catch (error) {
    return apiError(error, "Editing the master entry");
  }
}

// Employees and assets point at master rows with ON DELETE SET NULL foreign keys, so the
// database itself would happily blank those fields. Usage is therefore checked here and a
// used entry is refused, with a message saying where it is used.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  try {
    const session = requireRole(
      req,
      PRIVILEGED_ROLES,
      "Only an Admin, CEO or COO can delete master data. Ask one of them to delete this entry.",
    );
    const { type, id } = await params;
    if (!isMasterType(type)) throw unknownMaster(type);
    const singular = masterSingular[type];

    const removed = await db.$transaction(async (tx) => {
      const delegate = (tx as unknown as Record<string, Delegate>)[type];
      const row = await delegate.findUnique({ where: { id }, include: usageCountSelect(type) });
      if (!row) throw notFound(`This ${singular.toLowerCase()}`);
      const usage = describeUsage(type, row._count);
      if (usage) {
        throw new AppError(
          `${singular} “${row.name}” (${row.code}) cannot be deleted because it is used by ${usage}. Change those records to use a different ${singular.toLowerCase()} first, then delete this one. (Deleted employees and assets kept in deletion history are included in this count.)`,
          { status: 409, code: "MASTER_IN_USE" },
        );
      }
      const snapshot = { id: row.id, name: row.name, code: row.code };
      await delegate.delete({ where: { id } });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "ORGANISATION",
          recordType: type,
          recordId: id,
          action: "MASTER_DELETED",
          previousValue: snapshot,
        },
        tx,
      );
      return snapshot;
    });
    return NextResponse.json({ data: removed });
  } catch (error) {
    return apiError(error, "Deleting the master entry");
  }
}
