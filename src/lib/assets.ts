import { z } from "zod";
import { computeAssetDepreciation, type DepreciationAssetInput } from "@/lib/depreciation";

export const assetDateKeys = ["invoiceDate", "capitalisationDate", "disposalDate", "verificationDate"] as const;

// Raw, user-entered cost inputs. totalCapitalisedCost, and every book/tax depreciation
// figure below, are DERIVED — computed automatically (see deriveAssetComputedFields) —
// and are never accepted directly from a client, even if present in the request body.
export const assetNumberKeys = [
  "purchaseCost",
  "freight",
  "installationCost",
  "otherCost",
  "gstAmount",
  "itcAvailed",
  "usefulLife",
  "residualValue",
  "taxRate",
  "saleProceeds",
] as const;

// Fields the server always recomputes with the depreciation engine; a client-submitted
// value for any of these is ignored.
export const assetDerivedNumberKeys = [
  "totalCapitalisedCost",
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
  "taxDepreciation",
  "closingWdv",
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
  "taxBlock",
  "disposalRemarks",
  "verificationStatus",
] as const;

const DEPRECIATION_METHODS = ["SLM", "WDV"] as const;
const DISPOSAL_REASONS = ["SOLD", "SCRAPPED", "LOST", "DAMAGED", "WRITTEN_OFF", "TRANSFERRED", "OTHER"] as const;

export const assetSchema = z
  .object({
    faId: z.string().trim().min(1).max(50),
    category: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(300),
    status: z.enum(["AVAILABLE", "ASSIGNED", "PENDING_TRANSFER", "UNDER_REPAIR", "DISPOSED"]).optional(),
    itcEligible: z.coerce.boolean().optional(),
    depreciationMethod: z.enum(DEPRECIATION_METHODS).nullish(),
    disposalReason: z.enum(DISPOSAL_REASONS).nullish(),
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
  if (body.depreciationMethod !== undefined) data.depreciationMethod = body.depreciationMethod || null;
  if (body.disposalReason !== undefined) data.disposalReason = body.disposalReason || null;
  return data;
}

/**
 * Recompute every derived cost/depreciation field from the raw inputs. Always called
 * server-side before writing an asset (create or update) so the register can never show
 * stale or hand-entered figures for anything the depreciation engine owns. `existing` is
 * the current DB row (for an update) merged under `patch`, the fields being changed.
 */
export function deriveAssetComputedFields(existing: Record<string, unknown>, patch: Record<string, unknown>) {
  const merged: Record<string, unknown> = { ...existing, ...patch };
  const num = (key: string) => {
    const value = merged[key];
    if (value === null || value === undefined) return 0;
    return typeof value === "object" && value !== null && "toNumber" in (value as object)
      ? (value as { toNumber(): number }).toNumber()
      : Number(value);
  };
  const dateOf = (key: string) => {
    const value = merged[key];
    return value ? new Date(value as string) : null;
  };

  const purchaseCost = num("purchaseCost");
  const freight = num("freight");
  const installationCost = num("installationCost");
  const otherCost = num("otherCost");
  const gstAmount = num("gstAmount");
  const itcEligible = Boolean(merged.itcEligible);
  const totalCapitalisedCost = purchaseCost + freight + installationCost + otherCost + (itcEligible ? 0 : gstAmount);

  const input: DepreciationAssetInput = {
    totalCapitalisedCost,
    capitalisationDate: dateOf("capitalisationDate"),
    depreciationMethod: (merged.depreciationMethod as DepreciationAssetInput["depreciationMethod"]) ?? null,
    usefulLifeYears: merged.usefulLife ? num("usefulLife") : null,
    residualValue: num("residualValue"),
    taxRatePercent: merged.taxRate ? num("taxRate") : null,
    disposalDate: dateOf("disposalDate"),
    saleProceeds: merged.disposalDate ? num("saleProceeds") : null,
  };

  const today = new Date();
  const currentFyStartYear = today.getUTCMonth() >= 3 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
  const asOfYear = input.disposalDate
    ? (input.disposalDate.getUTCMonth() >= 3 ? input.disposalDate.getUTCFullYear() : input.disposalDate.getUTCFullYear() - 1)
    : currentFyStartYear;
  const { book, tax, profitLossOnDisposal } = computeAssetDepreciation(input, asOfYear);

  return {
    totalCapitalisedCost,
    openingGrossBlock: book.openingGrossBlock,
    additions: book.additions,
    disposals: book.disposals,
    closingGrossBlock: book.closingGrossBlock,
    openingAccumDep: book.openingAccumulatedDepreciation,
    depreciationYear: book.depreciationForYear,
    accumDepDisposal: book.accumulatedDepreciationOnDisposal,
    closingAccumDep: book.closingAccumulatedDepreciation,
    netBookValue: book.netBookValue,
    openingWdv: tax.openingWdv,
    taxAdditions: tax.additions,
    taxDisposals: tax.disposals,
    wdvBeforeDepreciation: tax.wdvBeforeDepreciation,
    taxDepreciation: tax.taxDepreciation,
    closingWdv: tax.closingWdv,
    profitLossOnDisposal: profitLossOnDisposal ?? 0,
  };
}
