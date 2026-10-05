import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { BooksAsset, FIRST_FY, MONTH_ORDER, TaxAsset, computeBooks, computeTaxBlocks, currentFy, fyDays, fyLabel } from "@/lib/depreciation";

const ms = (d: Date | null) => (d ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : null);

// R13: depreciation for a financial year and a set of ticked months, computed on the server
// every time from the asset register and the category / tax-block masters.
export async function GET(req: NextRequest) {
  try {
    requireRole(req, ["ADMIN", "HR", "CFO"]);
    const fy = Number(req.nextUrl.searchParams.get("fy") ?? currentFy());
    if (!Number.isInteger(fy) || fy < FIRST_FY || fy > FIRST_FY + 60) return NextResponse.json({ error: "Invalid financial year" }, { status: 400 });
    const monthsParam = req.nextUrl.searchParams.get("months");
    const months = (monthsParam === null ? [...MONTH_ORDER] : monthsParam.split(",").filter(Boolean).map(Number))
      .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);

    const [assets, categories, blocks] = await Promise.all([
      db.fixedAsset.findMany({
        select: {
          id: true, faId: true, description: true, category: true, purchaseCost: true, freight: true, installationCost: true, otherCost: true,
          totalCapitalisedCost: true, usefulLife: true, residualValue: true, capitalisationDate: true, invoiceDate: true, disposalDate: true,
          saleProceeds: true, taxBlock: true,
        },
        orderBy: { faId: "asc" },
      }),
      db.assetCategory.findMany(),
      db.taxBlock.findMany({ where: { active: true } }),
    ]);
    const catByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c]));
    const warnings: string[] = [];

    const books: BooksAsset[] = [];
    const tax: TaxAsset[] = [];
    for (const a of assets) {
      const cat = catByName.get(a.category.trim().toLowerCase());
      const cost = Number(a.totalCapitalisedCost) || Number(a.purchaseCost) + Number(a.freight) + Number(a.installationCost) + Number(a.otherCost);
      const life = a.usefulLife ?? cat?.usefulLifeYears ?? 0;
      if (!life) warnings.push(`${a.faId}: no useful life (asset or category "${a.category}" has none), so it is skipped`);
      const residual = Number(a.residualValue) > 0 ? Number(a.residualValue) : (cost * Number(cat?.residualPercent ?? 5)) / 100;
      const putToUse = ms(a.capitalisationDate ?? a.invoiceDate);
      if (!a.capitalisationDate) warnings.push(`${a.faId}: no capitalisation date${a.invoiceDate ? " (invoice date used)" : ""}`);
      if (life) books.push({ id: a.id, faId: a.faId, description: a.description, category: a.category, cost, residual, lifeYears: life, putToUse, disposal: ms(a.disposalDate) });
      tax.push({ id: a.faId, block: a.taxBlock ?? cat?.defaultTaxBlock ?? null, cost, putToUse, disposal: ms(a.disposalDate), saleProceeds: Number(a.saleProceeds) });
    }

    const rows = books.map((b) => computeBooks(b, fy, months));
    const sum = (f: (r: (typeof rows)[number]) => number) => Math.round(rows.reduce((s, r) => s + f(r), 0) * 100) / 100;
    const perMonth = MONTH_ORDER.filter((m) => months.includes(m)).map((m) => ({ month: m, charge: Math.round(rows.reduce((s, r) => s + (r.months.find((x) => x.month === m)?.raw ?? 0), 0) * 100) / 100 }));
    const taxResult = computeTaxBlocks(tax, blocks.map((b) => ({ name: b.name, rate: Number(b.rate) })), fy);
    if (taxResult.unassigned.length) warnings.push(`Income Tax: no valid block for ${taxResult.unassigned.join(", ")}`);
    return NextResponse.json(
      {
        fy, label: fyLabel(fy), fyDays: fyDays(fy), months: MONTH_ORDER.filter((m) => months.includes(m)),
        books: { rows, totals: { cost: sum((r) => r.cost), fyCharge: sum((r) => r.fyCharge), selectedTotal: sum((r) => r.selectedTotal), closingAccumulated: sum((r) => r.closingAccumulated), netBookValue: sum((r) => r.netBookValue), perMonth } },
        tax: { blocks: taxResult.blocks, total: Math.round(taxResult.blocks.reduce((s, b) => s + b.depreciation, 0) * 100) / 100 },
        warnings,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error, "Unable to calculate depreciation");
  }
}
