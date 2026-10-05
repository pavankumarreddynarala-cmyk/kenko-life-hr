// R14: what each kind of viewer may see when an asset QR code is scanned.
// The restriction is applied HERE, in the database select, so restricted fields never leave the server.
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type Viewer = "FULL" | "LIMITED";
/** Only the ADMIN role sees every group. HR, CFO and employees get the limited view. */
export const viewerFor = (role: string): Viewer => (role === "ADMIN" ? "FULL" : "LIMITED");

type Field = [key: string, label: string];
export const GROUPS: { id: string; title: string; limited: boolean; fields: Field[] }[] = [
  { id: "g1", title: "Group 1 · Asset identification", limited: true, fields: [["faId", "Asset ID"], ["category", "Asset Category"], ["description", "Asset Description"], ["makeModel", "Make / Model"], ["serialNo", "Serial No."]] },
  { id: "g2", title: "Group 2 · Purchase & vendor", limited: true, fields: [["vendorName", "Vendor Name"], ["invoiceNo", "Invoice No."], ["invoiceDate", "Invoice Date"], ["capitalisationDate", "Capitalisation Date"], ["poGrnNo", "PO / GRN No."]] },
  { id: "g3", title: "Group 3 · Location & responsibility", limited: false, fields: [["company", "Company"], ["location", "Location"], ["department", "Department"], ["costCentre", "Cost Centre"]] },
  { id: "g4", title: "Group 4 · Cost", limited: false, fields: [["purchaseCost", "Purchase Cost"], ["freight", "Freight"], ["installationCost", "Installation / Erection"], ["otherCost", "Other Direct Cost"], ["totalCapitalisedCost", "Total Capitalised Cost"], ["gstAmount", "GST Amount"], ["itcEligible", "ITC Eligible"], ["itcAvailed", "ITC Availed"]] },
  { id: "g5", title: "Group 5 · Depreciation (Books)", limited: false, fields: [["depreciationMethod", "Depreciation Method"], ["usefulLife", "Useful Life"], ["residualValue", "Residual Value"], ["openingGrossBlock", "Opening Gross Block"], ["additions", "Additions"], ["disposals", "Disposals"], ["closingGrossBlock", "Closing Gross Block"], ["openingAccumDep", "Opening Accumulated Depreciation"], ["depreciationYear", "Depreciation for Year"], ["accumDepDisposal", "Accumulated Depreciation on Disposal"], ["closingAccumDep", "Closing Accumulated Depreciation"], ["netBookValue", "Net Book Value"]] },
  { id: "g6", title: "Group 6 · Depreciation (Income Tax)", limited: false, fields: [["taxBlock", "Income-tax Block"], ["openingWdv", "Opening WDV"], ["taxAdditions", "Tax Additions"], ["taxDisposals", "Tax Disposals"], ["wdvBeforeDepreciation", "WDV before Depreciation"], ["taxRate", "Tax Depreciation Rate"], ["taxDepreciation", "Tax Depreciation"], ["closingWdv", "Closing WDV"]] },
  { id: "g7", title: "Group 7 · Disposal & verification", limited: false, fields: [["disposalDate", "Disposal Date"], ["disposalMethod", "Disposal Method"], ["saleProceeds", "Sale Proceeds"], ["profitLossOnDisposal", "Profit / Loss on Disposal"], ["verificationDate", "Verification Date"], ["verificationStatus", "Verification Status"]] },
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
  groups: { id: string; title: string; fields: { label: string; value: string | null }[] }[];
  custodian: { code: string | null; name: string | null; type: string; department?: string | null; since: string } | null;
};

/** Always reads the live row from the database; never cached. Returns null for an unknown token. */
export async function loadAssetForScan(token: string, viewer: Viewer): Promise<ScanResult | null> {
  const qr = await db.assetQRCode.findUnique({ where: { token }, select: { assetId: true } });
  if (!qr) return null;
  const asset = (await db.fixedAsset.findUnique({ where: { id: qr.assetId }, select: selectFor(viewer) })) as unknown as Record<string, unknown> | null;
  if (!asset) return null;
  const groups = GROUPS.filter((g) => viewer === "FULL" || g.limited).map((group) => ({
    id: group.id,
    title: group.title,
    fields: group.fields.map(([key, label]) => ({
      label,
      value: plain(RELATIONS.includes(key) ? (asset[key] as { name?: string } | null)?.name : asset[key]),
    })),
  }));
  const a = (asset.assignments as Array<{ custodianType: string; custodianName: string | null; assignedAt: Date; employee: { permanentId: string; name: string; department?: { name: string } | null } | null }>)[0];
  return {
    viewer,
    updatedAt: (asset.updatedAt as Date).toISOString(),
    ...(viewer === "FULL" ? { status: String(asset.status) } : {}),
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
