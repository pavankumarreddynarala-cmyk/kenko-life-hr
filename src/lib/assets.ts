import { z } from "zod";
import "@/lib/zod-errors";
import type { Prisma } from "@prisma/client";
import { AppError, type FieldIssue } from "@/lib/app-error";
import { fieldLabel } from "@/lib/field-labels";
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
    faId: z.string({ required_error: "Enter an Asset ID (for example FA000123)." }).trim().min(1, "Enter an Asset ID (for example FA000123).").max(50, "Asset ID can be at most 50 characters."),
    category: z.string({ required_error: "Enter the asset category (for example Laptop or Furniture)." }).trim().min(1, "Enter the asset category (for example Laptop or Furniture).").max(100, "Asset category can be at most 100 characters."),
    description: z.string({ required_error: "Enter a short description of the asset." }).trim().min(1, "Enter a short description of the asset.").max(300, "Asset description can be at most 300 characters."),
    status: z.enum(["AVAILABLE", "ASSIGNED", "PENDING_TRANSFER", "UNDER_REPAIR", "DISPOSED"]).optional(),
    itcEligible: z.coerce.boolean().optional(),
    depreciationMethod: z.enum(DEPRECIATION_METHODS).nullish(),
    disposalReason: z.enum(DISPOSAL_REASONS).nullish(),
  })
  .passthrough();

export function assetData(body: Record<string, unknown>, creating: boolean) {
  const parsed = (creating ? assetSchema : assetSchema.partial()).safeParse(body);
  if (!parsed.success) throw parsed.error;
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
      if (!Number.isFinite(value) || value < 0) {
        const label = fieldLabel(key);
        throw new AppError(
          `${label}: enter a number that is 0 or more, using digits only (for example 1500 or 1500.50).`,
          { status: 400, code: "VALIDATION_ERROR", fields: [{ field: key, label, message: "Enter a number that is 0 or more, using digits only." }] },
        );
      }
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

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  return typeof value === "object" && "toNumber" in (value as object)
    ? (value as { toNumber(): number }).toNumber()
    : Number(value);
}

export const ITC_NOT_ELIGIBLE_MESSAGE =
  "ITC Availed must be 0 (or blank) when ITC Eligible is No. Set ITC Eligible to Yes if this asset qualifies for input tax credit, or clear the ITC amount.";

/** The ITC issue in a merged asset record, if any (ITC can only be availed when eligible). */
export function itcIssue(record: { itcEligible?: unknown; itcAvailed?: unknown }): FieldIssue | null {
  if (!record.itcEligible && asNumber(record.itcAvailed) > 0) {
    return { field: "itcAvailed", label: fieldLabel("itcAvailed"), message: ITC_NOT_ELIGIBLE_MESSAGE };
  }
  return null;
}

/**
 * Enforces "ITC amount only when ITC Eligible = Yes" against the record as it will look
 * after the write. Only checked when the write touches either ITC field, so unrelated
 * edits to older rows are not blocked.
 */
export function assertItcRule(existing: Record<string, unknown>, patch: Record<string, unknown>) {
  if (!("itcEligible" in patch) && !("itcAvailed" in patch)) return;
  const issue = itcIssue({ ...existing, ...patch });
  if (issue) throw new AppError(issue.message, { status: 400, code: "VALIDATION_ERROR", fields: [issue] });
}

/** Rejects an Asset ID / Serial No. another asset already uses (deleted assets included). */
export async function assertAssetUnique(
  tx: Prisma.TransactionClient,
  values: { faId?: unknown; serialNo?: unknown },
  excludeId?: string,
) {
  const issues: FieldIssue[] = [];
  for (const field of ["faId", "serialNo"] as const) {
    const value = values[field];
    if (typeof value !== "string" || !value) continue;
    const holder = await tx.fixedAsset.findFirst({
      where: { [field]: value, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { faId: true, description: true, deletedAt: true },
    });
    if (!holder) continue;
    const label = fieldLabel(field);
    issues.push({
      field,
      label,
      message: `${label} ${value} is already used by asset ${holder.faId} (${holder.description})${
        holder.deletedAt ? ", which was deleted. Restore that asset from the deleted list or enter a different " + label : ". Enter a different " + label + ", or edit the existing asset instead"
      }.`,
    });
  }
  if (issues.length) {
    throw new AppError(issues.map((issue) => issue.message).join(" "), {
      status: 409,
      code: "DUPLICATE_VALUE",
      fields: issues,
    });
  }
}
