/**
 * Automatic fixed-asset depreciation for the Asset Register.
 *
 * WHAT THIS COMPUTES, PER ASSET, FOR A SELECTED "AS-OF" PERIOD (financial year + month):
 *   - Book depreciation (for the Gross Block / Accumulated Depreciation / Net Book Value
 *     column groups) using either the Straight Line Method (SLM) or the Written Down
 *     Value method (WDV), driven by useful life and residual value — i.e. the approach
 *     used to implement Schedule II (Companies Act, 2013) once a useful life and
 *     residual value have been decided for the asset.
 *   - Income-tax block depreciation (WDV) using the block's prescribed rate and the
 *     Income Tax Act's 180-day rule for the year of addition.
 *
 * KEY ASSUMPTIONS (please review these — they are simplifications of real tax/company
 * law that a CA should confirm match the firm's convention before relying on the output):
 *   1. "Financial year" is identified by its STARTING calendar year, in the Indian
 *      April–March convention. year=2026 means FY 2026-27 (1 Apr 2026 – 31 Mar 2027).
 *   2. Book depreciation is prorated by whole months of use within the financial year
 *      (not exact days). An asset capitalised any time in a given month is treated as
 *      "in use" for that whole month.
 *   3. WDV book rate is derived from cost, residual value and useful life using the
 *      standard Schedule II formula rate = 1 − (residual/cost)^(1/usefulLife). This
 *      needs residual value > 0; if residual value is 0, this file falls back to SLM
 *      for that asset and flags it in the result so the UI/CA can see the fallback.
 *   4. Depreciation never takes the net book value below the residual value.
 *   5. Income-tax block depreciation is computed PER ASSET (this register does not pool
 *      multiple assets into one shared block, which is how the Income Tax Act actually
 *      works). The 180-day test is applied using the exact number of days from the
 *      capitalisation date to 31 March of the acquisition year. From the second year
 *      onward, the full block rate applies with no month/day proration, matching the
 *      Act's treatment of a continuing block.
 *   6. On disposal, book "Profit / loss on disposal" is computed against the BOOK net
 *      book value (not the tax WDV), matching how disposal gain/loss is normally booked
 *      in company accounts. No tax depreciation is charged in the tax block for the
 *      year an asset is disposed in this per-asset model.
 *   7. All monetary results are rounded to 2 decimal places.
 */

export type DepreciationMethod = "SLM" | "WDV";

export type DepreciationAssetInput = {
  totalCapitalisedCost: number;
  capitalisationDate: Date | null;
  depreciationMethod: DepreciationMethod | null;
  usefulLifeYears: number | null;
  residualValue: number | null;
  taxRatePercent: number | null;
  disposalDate: Date | null;
  saleProceeds: number | null;
};

export type BookDepreciationResult = {
  financialYear: string;
  methodUsed: DepreciationMethod | null;
  methodFallback: boolean;
  openingGrossBlock: number;
  additions: number;
  disposals: number;
  closingGrossBlock: number;
  openingAccumulatedDepreciation: number;
  depreciationForYear: number;
  ytdDepreciation: number;
  accumulatedDepreciationOnDisposal: number;
  closingAccumulatedDepreciation: number;
  netBookValue: number;
  remainingUsefulLifeYears: number | null;
};

export type TaxDepreciationResult = {
  financialYear: string;
  openingWdv: number;
  additions: number;
  disposals: number;
  wdvBeforeDepreciation: number;
  ratePercent: number;
  taxDepreciation: number;
  closingWdv: number;
};

export type AssetDepreciationResult = {
  book: BookDepreciationResult;
  tax: TaxDepreciationResult;
  profitLossOnDisposal: number | null;
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function fyLabel(startYear: number) {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** FY that STARTS in `startYear` (1 Apr startYear – 31 Mar startYear+1), as UTC dates. */
function fyBounds(startYear: number) {
  return {
    start: new Date(Date.UTC(startYear, 3, 1)),
    end: new Date(Date.UTC(startYear + 1, 2, 31, 23, 59, 59, 999)),
  };
}

/** The financial-year start-year containing a given calendar date. */
function fyStartYearFor(date: Date) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0 = Jan
  return m >= 3 ? y : y - 1;
}

/** Whole months of use within [fyStart, cutoff], counting a started month as a full month. */
function monthsInUse(usageStart: Date, usageEnd: Date, fyStart: Date, cutoff: Date) {
  const start = usageStart > fyStart ? usageStart : fyStart;
  const end = usageEnd < cutoff ? usageEnd : cutoff;
  if (end < start) return 0;
  const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()) + 1;
  return Math.min(12, Math.max(0, months));
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

/**
 * Resolve the requested "as of" point into a financial year + a cutoff date used for
 * year-to-date figures. `year` is the FY start year (see assumption #1). `month` is the
 * calendar month (1-12) the person selected; it must fall inside that financial year
 * (Apr..Dec of `year`, or Jan..Mar of `year + 1`) — if it doesn't, it's clamped into the
 * financial year's own range instead of throwing, so a stray value never blocks the page.
 */
export function resolvePeriod(year: number, month?: number) {
  const { start, end } = fyBounds(year);
  if (!month) return { fyStartYear: year, start, end, cutoff: end };
  const calendarYear = month >= 4 ? year : year + 1;
  const cutoffCandidate = new Date(Date.UTC(calendarYear, month, 0, 23, 59, 59, 999)); // last day of that month
  const cutoff = cutoffCandidate < start ? start : cutoffCandidate > end ? end : cutoffCandidate;
  return { fyStartYear: year, start, end, cutoff };
}

function bookRateForWdv(cost: number, residual: number, usefulLifeYears: number) {
  if (cost <= 0 || residual <= 0 || residual >= cost || usefulLifeYears <= 0) return null;
  return 1 - Math.pow(residual / cost, 1 / usefulLifeYears);
}

/**
 * Book depreciation (Gross Block / Accumulated Depreciation / Net Book Value groups),
 * computed by walking year-by-year from the capitalisation date up to the requested FY.
 */
function computeBook(asset: DepreciationAssetInput, fyStartYear: number, cutoff: Date): BookDepreciationResult {
  const cost = asset.totalCapitalisedCost || 0;
  const residual = Math.max(0, asset.residualValue ?? 0);
  const usefulLife = asset.usefulLifeYears ?? null;
  const capDate = asset.capitalisationDate;
  const disposalDate = asset.disposalDate;
  const depreciableBase = Math.max(0, cost - residual);

  if (!capDate || !usefulLife || usefulLife <= 0) {
    return {
      financialYear: fyLabel(fyStartYear),
      methodUsed: asset.depreciationMethod,
      methodFallback: false,
      openingGrossBlock: 0,
      additions: 0,
      disposals: 0,
      closingGrossBlock: cost,
      openingAccumulatedDepreciation: 0,
      depreciationForYear: 0,
      ytdDepreciation: 0,
      accumulatedDepreciationOnDisposal: 0,
      closingAccumulatedDepreciation: 0,
      netBookValue: cost,
      remainingUsefulLifeYears: usefulLife,
    };
  }

  let requestedMethod: DepreciationMethod = asset.depreciationMethod ?? "SLM";
  let methodFallback = false;
  const wdvRate = requestedMethod === "WDV" ? bookRateForWdv(cost, residual, usefulLife) : null;
  if (requestedMethod === "WDV" && wdvRate === null) {
    requestedMethod = "SLM";
    methodFallback = true;
  }
  const slmAnnual = depreciableBase / usefulLife;

  const capFyStart = fyStartYearFor(capDate);
  let openingAccumDep = 0;
  let openingGrossBlockOfTargetYear = cost;
  let depreciationForTargetYear = 0;
  let ytdDepreciation = 0;
  let accumOnDisposal = 0;
  let netBookValueAtCutoff = cost;

  // Walk every FY from acquisition up to (and including) the target FY.
  for (let fy = capFyStart; fy <= fyStartYear; fy++) {
    const { start: fyStart, end: fyEnd } = fyBounds(fy);
    const wasDisposedThisYear = disposalDate && disposalDate >= fyStart && disposalDate <= fyEnd;
    const usageEnd = wasDisposedThisYear ? disposalDate! : fyEnd;
    const monthsUsedFullYear = monthsInUse(capDate, usageEnd, fyStart, fyEnd);
    const monthsUsedToCutoff = fy === fyStartYear ? monthsInUse(capDate, usageEnd, fyStart, cutoff) : monthsUsedFullYear;

    const openingWdvBook = cost - openingAccumDep;
    const remainingDepreciable = Math.max(0, openingWdvBook - residual);

    let yearDep: number;
    if (requestedMethod === "SLM") {
      yearDep = Math.min(remainingDepreciable, slmAnnual * (monthsUsedFullYear / 12));
    } else {
      yearDep = Math.min(remainingDepreciable, openingWdvBook * (wdvRate as number) * (monthsUsedFullYear / 12));
    }
    yearDep = Math.max(0, yearDep);

    let ytdDep: number;
    if (requestedMethod === "SLM") {
      ytdDep = Math.min(remainingDepreciable, slmAnnual * (monthsUsedToCutoff / 12));
    } else {
      ytdDep = Math.min(remainingDepreciable, openingWdvBook * (wdvRate as number) * (monthsUsedToCutoff / 12));
    }
    ytdDep = Math.max(0, ytdDep);

    if (fy === fyStartYear) {
      openingGrossBlockOfTargetYear = cost;
      depreciationForTargetYear = yearDep;
      ytdDepreciation = ytdDep;
      netBookValueAtCutoff = openingWdvBook - ytdDep;
      if (wasDisposedThisYear) accumOnDisposal = openingAccumDep + ytdDep;
    }

    openingAccumDep += yearDep;
    if (wasDisposedThisYear) break;
  }

  const closingAccumDep = round2(openingAccumDep);
  return {
    financialYear: fyLabel(fyStartYear),
    methodUsed: requestedMethod,
    methodFallback,
    openingGrossBlock: round2(openingGrossBlockOfTargetYear),
    additions: 0,
    disposals: disposalDate && fyStartYearFor(disposalDate) === fyStartYear ? round2(cost) : 0,
    closingGrossBlock: round2(cost),
    openingAccumulatedDepreciation: round2(closingAccumDep - depreciationForTargetYear),
    depreciationForYear: round2(depreciationForTargetYear),
    ytdDepreciation: round2(ytdDepreciation),
    accumulatedDepreciationOnDisposal: round2(accumOnDisposal),
    closingAccumulatedDepreciation: closingAccumDep,
    netBookValue: round2(Math.max(residual, netBookValueAtCutoff)),
    remainingUsefulLifeYears: Math.max(0, round2(usefulLife - (fyStartYear - capFyStart + 1))),
  };
}

/** Income-tax block WDV depreciation with the 180-day rule for the year of addition. */
function computeTax(asset: DepreciationAssetInput, fyStartYear: number): TaxDepreciationResult {
  const cost = asset.totalCapitalisedCost || 0;
  const rate = Math.max(0, (asset.taxRatePercent ?? 0) / 100);
  const capDate = asset.capitalisationDate;
  const disposalDate = asset.disposalDate;

  if (!capDate || rate <= 0) {
    return {
      financialYear: fyLabel(fyStartYear),
      openingWdv: 0,
      additions: 0,
      disposals: 0,
      wdvBeforeDepreciation: cost,
      ratePercent: (asset.taxRatePercent ?? 0),
      taxDepreciation: 0,
      closingWdv: cost,
    };
  }

  const capFyStart = fyStartYearFor(capDate);
  let openingWdv = 0;
  let wdvBeforeDep = cost;
  let taxDep = 0;
  let additionsForTargetYear = 0;

  for (let fy = capFyStart; fy <= fyStartYear; fy++) {
    const { start: fyStart, end: fyEnd } = fyBounds(fy);
    const isAcquisitionYear = fy === capFyStart;
    const wasDisposedThisYear = disposalDate && disposalDate >= fyStart && disposalDate <= fyEnd;
    const addition = isAcquisitionYear ? cost : 0;
    wdvBeforeDep = openingWdv + addition;

    let yearDep = 0;
    if (!wasDisposedThisYear) {
      if (isAcquisitionYear) {
        const daysInUse = daysBetween(capDate, fyEnd);
        const halfRate = daysInUse < 180;
        yearDep = wdvBeforeDep * rate * (halfRate ? 0.5 : 1);
      } else {
        yearDep = wdvBeforeDep * rate;
      }
    }

    if (fy === fyStartYear) {
      additionsForTargetYear = addition;
      taxDep = yearDep;
    }
    openingWdv = wdvBeforeDep - yearDep - (wasDisposedThisYear ? Math.min(wdvBeforeDep, asset.saleProceeds ?? 0) : 0);
    if (wasDisposedThisYear) break;
  }

  return {
    financialYear: fyLabel(fyStartYear),
    openingWdv: round2(wdvBeforeDep - additionsForTargetYear),
    additions: round2(additionsForTargetYear),
    disposals: disposalDate && fyStartYearFor(disposalDate) === fyStartYear ? round2(Math.min(wdvBeforeDep, asset.saleProceeds ?? 0)) : 0,
    wdvBeforeDepreciation: round2(wdvBeforeDep),
    ratePercent: asset.taxRatePercent ?? 0,
    taxDepreciation: round2(taxDep),
    closingWdv: round2(openingWdv),
  };
}

/**
 * Compute both book and tax depreciation for one asset as of a selected financial year
 * (and, optionally, a month within it for a year-to-date figure). Pass `year` as the FY
 * START year — see assumption #1 above.
 */
export function computeAssetDepreciation(
  asset: DepreciationAssetInput,
  year: number,
  month?: number,
): AssetDepreciationResult {
  const { fyStartYear, cutoff } = resolvePeriod(year, month);
  const book = computeBook(asset, fyStartYear, cutoff);
  const tax = computeTax(asset, fyStartYear);

  let profitLossOnDisposal: number | null = null;
  if (asset.disposalDate && asset.saleProceeds !== null && asset.saleProceeds !== undefined) {
    // Book NBV immediately before disposal = closing accumulated depreciation as of the
    // disposal year (computed above) subtracted from cost.
    const nbvAtDisposal = round2((asset.totalCapitalisedCost || 0) - book.closingAccumulatedDepreciation);
    profitLossOnDisposal = round2(asset.saleProceeds - nbvAtDisposal);
  }

  return { book, tax, profitLossOnDisposal };
}
