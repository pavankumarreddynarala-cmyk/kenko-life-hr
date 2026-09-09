import { z } from "zod";

export const assetDateKeys = ["invoiceDate", "capitalisationDate", "disposalDate", "verificationDate"] as const;
export const assetNumberKeys = [
  "purchaseCost",
  "freight",
  "installationCost",
  "otherCost",
  "totalCapitalisedCost",
  "gstAmount",
  "itcAvailed",
  "usefulLife",
  "residualValue",
  "openingGrossBlock",
  "additions",
  "disposals",
  "closingGrossBlock",
  "openingAccumDep",
  "depreciationYear",
  "accumDepDisposal",
  "closingAccumDep",
  "netBookValue",
  "openingWdv",
  "taxAdditions",
  "taxDisposals",
  "wdvBeforeDepreciation",
  "taxRate",
  "taxDepreciation",
  "closingWdv",
  "saleProceeds",
  "profitLossOnDisposal",
] as const;
export const assetTextKeys = [
  "faId",
  "category",
  "description",
  "makeModel",
  "serialNo",
  "vendorName",
  "invoiceNo",
  "poGrnNo",
  "companyId",
  "locationId",
  "departmentId",
  "costCentreId",
  "depreciationMethod",
  "taxBlock",
  "disposalMethod",
  "verificationStatus",
] as const;

export const assetSchema = z
  .object({
    faId: z.string().trim().min(1).max(50),
    category: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(300),
    status: z.enum(["AVAILABLE", "ASSIGNED", "PENDING_TRANSFER", "UNDER_REPAIR", "DISPOSED"]).optional(),
    itcEligible: z.coerce.boolean().optional(),
  })
  .passthrough();

export function assetData(body: Record<string, unknown>, creating: boolean) {
  const parsed = (creating ? assetSchema : assetSchema.partial()).safeParse(body);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const data: Record<string, unknown> = {};
  const textKeys = creating ? assetTextKeys : assetTextKeys.filter((key) => key !== "faId");
  for (const key of textKeys) {
    if (body[key] !== undefined) data[key] = body[key] === "" || body[key] === null ? null : String(body[key]).trim();
  }
  for (const key of assetDateKeys) {
    if (body[key] !== undefined) data[key] = body[key] ? new Date(String(body[key])) : null;
  }
  for (const key of assetNumberKeys) {
    if (body[key] !== undefined) {
      if (body[key] === "" || body[key] === null) {
        data[key] = null;
        continue;
      }
      const value = Number(body[key]);
      if (!Number.isFinite(value) || value < 0) throw new Error(`${key} must be a non-negative number`);
      data[key] = key === "usefulLife" ? Math.trunc(value) : value;
    }
  }
  if (body.itcEligible !== undefined) data.itcEligible = Boolean(body.itcEligible);
  if (body.status !== undefined) data.status = body.status;
  return data;
}
