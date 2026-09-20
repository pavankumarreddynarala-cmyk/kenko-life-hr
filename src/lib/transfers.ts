import { Prisma } from "@prisma/client";

export const transferInclude = {
  asset: { include: { assignments: { where: { returnedAt: null }, include: { employee: true }, take: 1 } } },
  sender: true,
  receiver: true,
  events: { orderBy: { createdAt: "desc" as const } },
} as const;

export async function assignAsset(
  tx: Prisma.TransactionClient,
  assetId: string,
  employeeId: string,
  effectiveDate: Date,
  note: string,
) {
  await tx.assetAssignment.updateMany({
    where: { assetId, returnedAt: null },
    data: { returnedAt: effectiveDate, notes: note },
  });
  await tx.assetAssignment.create({
    data: { assetId, employeeId, custodianType: "EMPLOYEE", assignedAt: effectiveDate, notes: note },
  });
  await tx.fixedAsset.update({ where: { id: assetId }, data: { status: "ASSIGNED" } });
}
