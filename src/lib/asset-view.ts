// R14: what each kind of viewer may see when an asset QR code is scanned.
// The restriction is applied HERE, in the database select, so restricted fields never leave the server.
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isPrivilegedRole } from "@/lib/permissions";

export type Viewer = "FULL" | "LIMITED";
/** Admin, CEO and COO (the privileged roles) see every group. HR, CFO and employees get the limited view. */
export const viewerFor = (role: string): Viewer => (isPrivilegedRole(role) ? "FULL" : "LIMITED");

// Same grouping as the Asset Register screen. Groups 1 and 2 (plus the custodian) are the only
// ones an employee ever receives.
type Field = [key: string, label: string];
export const GROUPS: { id: string; title: string; limited: boolean; fields: Field[] }[] = [
  { id: "g1", title: "Group 1 · Asset identification", limited: true, fields: [["faId", "Asset ID"], ["category", "Asset Category"], ["description", "Asset Description"], ["makeModel", "Make / Model"], ["serialNo", "Serial No."]] },
  { id: "g2", title: "Group 2 · Purchase & vendor information", limited: true, fields: [["vendorName", "Vendor Name"], ["invoiceNo", "Invoice No."], ["invoiceDate", "Invoice Date"], ["capitalisationDate", "Capitalisation Date"], ["poGrnNo", "PO / GRN No."]] },
  { id: "g3", title: "Group 3 · Location & organisation", limited: false, fields: [["company", "Company"], ["location", "Location"], ["department", "Department"], ["costCentre", "Cost Centre"]] },
  { id: "g4", title: "Group 4 · Cost information", limited: false, fields: [["purchaseCost", "Purchase Cost"], ["freight", "Freight"], ["installationCost", "Installation / Erection"], ["otherCost", "Other Direct Cost"], ["gstAmount", "GST Amount"], ["itcEligible", "ITC Eligible"], ["itcAvailed", "ITC Amount Claimed / Availed"], ["totalCapitalisedCost", "Total Capitalised Cost"]] },
  { id: "g5", title: "Group 5 · Depreciation configuration", limited: false, fields: [["depreciationMethod", "Depreciation Method"], ["usefulLife", "Useful Life (years)"], ["residualValue", "Residual Value"]] },
  { id: "g6", title: "Group 6 · Gross block", limited: false, fields: [["openingGrossBlock", "Opening Gross Block"], ["additions", "Additions"], ["disposals", "Disposals"], ["closingGrossBlock", "Closing Gross Block"]] },
  { id: "g7", title: "Group 7 · Accumulated depreciation", limited: false, fields: [["openingAccumDep", "Opening Accumulated Depreciation"], ["depreciationYear", "Depreciation for Year"], ["accumDepDisposal", "Accumulated Depreciation on Disposal"], ["closingAccumDep", "Closing Accumulated Depreciation"]] },
  { id: "g8", title: "Group 8 · Net book value", limited: false, fields: [["netBookValue", "Net Book Value"]] },
  { id: "g9", title: "Group 9 · Income-tax block (WDV)", limited: false, fields: [["taxBlock", "Income-tax Block"], ["taxRate", "Tax Depreciation Rate (%)"], ["openingWdv", "Opening WDV"], ["taxAdditions", "Tax Additions"], ["taxDisposals", "Tax Disposals"], ["wdvBeforeDepreciation", "WDV before Depreciation"], ["taxDepreciation", "Tax Depreciation"], ["closingWdv", "Closing WDV"]] },
  { id: "g10", title: "Disposal & verification", limited: false, fields: [["disposalDate", "Disposal Date"], ["disposalReason", "Disposal Reason"], ["disposalRemarks", "Disposal Remarks"], ["saleProceeds", "Sale Proceeds"], ["profitLossOnDisposal", "Profit / Loss on Disposal"], ["verificationDate", "Verification Date"], ["verificationStatus", "Verification Status"]] },
];

const RELATIONS = ["company", "location", "department", "costCentre"];

function selectFor(viewer: Viewer): Prisma.FixedAssetSelect {
  const select: Record<string, unknown> = { id: true, updatedAt: true };
  for (const group of GROUPS) {
    if (viewer === "LIMITED" && !group.limited) continue;
    for (const [key] of group.fields) {
      if (RELATIONS.includes(key)) select[key] = { select: { name: true } };
      else select[key] = true;
    }
  }
  if (viewer === "FULL") select.status = true;
  select.assignments = {
    where: { returnedAt: null },
    take: 1,
    select: {
      custodianType: true,
      custodianName: true,
      assignedAt: true,
      // Custody details only: who the asset belongs to. No contact, ID or bank data.
      employee: { select: { permanentId: true, name: true, ...(viewer === "FULL" ? { department: { select: { name: true } } } : {}) } },
    },
  };
  return select as Prisma.FixedAssetSelect;
}

function plain(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object" && value !== null && "toString" in value) return String(value); // Prisma Decimal
  return String(value);
}

export type ScanResult = {
  viewer: Viewer;
  updatedAt: string;
  status?: string;
  deleted?: boolean;
  groups: { id: string; title: string; fields: { label: string; value: string | null }[] }[];
  custodian: { code: string | null; name: string | null; type: string; department?: string | null; since: string } | null;
};

/** Always reads the live row from the database; never cached. Returns null for an unknown token. */
export async function loadAssetForScan(token: string, viewer: Viewer): Promise<ScanResult | null> {
  const qr = await db.assetQRCode.findUnique({ where: { token }, select: { assetId: true } });
  if (!qr) return null;
  const asset = (await db.fixedAsset.findUnique({ where: { id: qr.assetId }, select: { ...selectFor(viewer), deletedAt: true } })) as unknown as Record<string, unknown> | null;
  // A deleted asset is invisible to everyone but the full viewer, who is told it was deleted.
  if (!asset || (asset.deletedAt && viewer !== "FULL")) return null;
  const groups = GROUPS.filter((g) => viewer === "FULL" || g.limited).map((group) => ({
    id: group.id,
    title: group.title,
    fields: group.fields.map(([key, label]) => ({
      label,
      value: plain(RELATIONS.includes(key) ? (asset[key] as { name?: string } | null)?.name : asset[key]),
    })),
  }));
  const deleted = Boolean(asset.deletedAt);
  const a = (asset.assignments as Array<{ custodianType: string; custodianName: string | null; assignedAt: Date; employee: { permanentId: string; name: string; department?: { name: string } | null } | null }>)[0];
  return {
    viewer,
    updatedAt: (asset.updatedAt as Date).toISOString(),
    ...(viewer === "FULL" ? { status: String(asset.status), deleted } : {}),
    groups,
    custodian: a
      ? {
          code: a.employee?.permanentId ?? null,
          name: a.employee?.name ?? a.custodianName,
          type: a.custodianType,
          ...(viewer === "FULL" ? { department: a.employee?.department?.name ?? null } : {}),
          since: a.assignedAt.toISOString().slice(0, 10),
        }
      : null,
  };
}

export { tokenFromScan } from "@/lib/scan-token";
