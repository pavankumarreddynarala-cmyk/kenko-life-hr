import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { assetData, deriveAssetComputedFields } from "@/lib/assets";
import { computeAssetDepreciation, type DepreciationAssetInput } from "@/lib/depreciation";
import { apiError } from "@/lib/api-error";

const include = {
  qr: true,
  company: true,
  location: true,
  department: true,
  costCentre: true,
  assignments: {
    where: { returnedAt: null },
    include: { employee: { select: { id: true, permanentId: true, name: true } } },
    take: 1,
  },
} as const;

function toDepreciationInput(asset: {
  totalCapitalisedCost: unknown;
  capitalisationDate: Date | null;
  depreciationMethod: string | null;
  usefulLife: number | null;
  residualValue: unknown;
  taxRate: unknown;
  disposalDate: Date | null;
  saleProceeds: unknown;
}): DepreciationAssetInput {
  const asNumber = (value: unknown) =>
    value === null || value === undefined
      ? 0
      : typeof value === "object" && "toNumber" in (value as object)
        ? (value as { toNumber(): number }).toNumber()
        : Number(value);
  return {
    totalCapitalisedCost: asNumber(asset.totalCapitalisedCost),
    capitalisationDate: asset.capitalisationDate,
    depreciationMethod: (asset.depreciationMethod as DepreciationAssetInput["depreciationMethod"]) ?? null,
    usefulLifeYears: asset.usefulLife,
    residualValue: asNumber(asset.residualValue),
    taxRatePercent: asset.taxRate ? asNumber(asset.taxRate) : null,
    disposalDate: asset.disposalDate,
    saleProceeds: asset.disposalDate ? asNumber(asset.saleProceeds) : null,
  };
}

// Parses ?year=2026&month=9 (single period) or ?years=2024,2025,2026 (multi-year
// selection). `year` is the financial-year START year — FY 2026 means Apr 2026–Mar 2027.
function parsePeriodParams(searchParams: URLSearchParams) {
  const years = searchParams
    .get("years")
    ?.split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value));
  const year = searchParams.get("year") ? Number(searchParams.get("year")) : undefined;
  const month = searchParams.get("month") ? Number(searchParams.get("month")) : undefined;
  if (years?.length) return { years };
  if (year && Number.isInteger(year)) return { years: [year], month };
  return null;
}

export async function GET(req: NextRequest) {
  try {
    requireRole(req, MANAGEMENT_ROLES);
    const data = await db.fixedAsset.findMany({ include, take: 500, orderBy: { createdAt: "desc" } });
    const period = parsePeriodParams(req.nextUrl.searchParams);
    if (!period) return NextResponse.json({ data });

    // Period-based depreciation is computed on the fly from each asset's stored
    // capitalisation date, cost, method, useful life, residual value and tax rate —
    // no separate per-period ledger is stored (see src/lib/depreciation.ts).
    const withDepreciation = data.map((asset) => {
      const input = toDepreciationInput(asset);
      const depreciationByYear = Object.fromEntries(
        period.years.map((year) => [String(year), computeAssetDepreciation(input, year, period.month)]),
      );
      return { ...asset, depreciationByYear };
    });
    return NextResponse.json({ data: withDepreciation, period });
  } catch (error) {
    return apiError(error, "Unable to load assets");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const rawData = { ...assetData(await req.json(), true), status: "AVAILABLE" as const };
    const data = { ...rawData, ...deriveAssetComputedFields({}, rawData) };
    const asset = await db.$transaction(async (tx) => {
      const created = await tx.fixedAsset.create({ data: { ...data, qr: { create: {} } } as never, include });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "ASSET",
          recordType: "FixedAsset",
          recordId: created.id,
          action: "CREATED",
          newValue: created,
        },
        tx,
      );
      return created;
    });
    return NextResponse.json({ data: asset }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create asset";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
