import { Prisma } from "@prisma/client";

// Transfers are visible to employees, so these selects deliberately expose identification only:
// no cost, depreciation, PAN, Aadhaar, bank or contact fields ever leave the server through here.
const person = { select: { id: true, permanentId: true, name: true } } as const;
export const safeAssetSelect = {
  id: true,
  faId: true,
  category: true,
  description: true,
  makeModel: true,
  serialNo: true,
  status: true,
  qr: { select: { token: true } },
} as const;

export const transferInclude = {
  asset: { select: { ...safeAssetSelect, assignments: { where: { returnedAt: null }, select: { id: true, custodianName: true, employee: person }, take: 1 } } },
  sender: person,
  receiver: person,
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
