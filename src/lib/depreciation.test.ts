import { describe, expect, it } from "vitest";
import { computeAssetDepreciation, resolvePeriod } from "./depreciation";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("resolvePeriod", () => {
  it("treats year as the FY start year (Apr–Mar)", () => {
    const { fyStartYear, start, end } = resolvePeriod(2026);
    expect(fyStartYear).toBe(2026);
    expect(start.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(end.toISOString().slice(0, 10)).toBe("2027-03-31");
  });

  it("resolves a month inside the FY to the right calendar year", () => {
    // September (month 9) of FY starting 2026 is September 2026 itself.
    const sep = resolvePeriod(2026, 9);
    expect(sep.cutoff.toISOString().slice(0, 10)).toBe("2026-09-30");
    // January (month 1) of FY starting 2026 is January 2027.
    const jan = resolvePeriod(2026, 1);
    expect(jan.cutoff.toISOString().slice(0, 10)).toBe("2027-01-31");
  });
});

describe("book depreciation — SLM", () => {
  const base = {
    totalCapitalisedCost: 120000,
    depreciationMethod: "SLM" as const,
    usefulLifeYears: 3,
    residualValue: 12000,
    taxRatePercent: 40,
    disposalDate: null,
    saleProceeds: null,
  };

  it("charges a full year evenly across the useful life", () => {
    const asset = { ...base, capitalisationDate: d("2024-04-01") };
    // (120000 - 12000) / 3 = 36000/year.
    expect(computeAssetDepreciation(asset, 2024).book.depreciationForYear).toBe(36000);
    expect(computeAssetDepreciation(asset, 2024).book.netBookValue).toBe(84000);
    expect(computeAssetDepreciation(asset, 2025).book.netBookValue).toBe(48000);
    // Final year lands exactly on the residual value.
    expect(computeAssetDepreciation(asset, 2026).book.netBookValue).toBe(12000);
    expect(computeAssetDepreciation(asset, 2026).book.closingAccumulatedDepreciation).toBe(108000);
  });

  it("prorates the first year by months in use", () => {
    const asset = { ...base, capitalisationDate: d("2024-10-01") };
    // 6 months in use (Oct–Mar) out of the 36000 annual charge = 18000.
    expect(computeAssetDepreciation(asset, 2024).book.depreciationForYear).toBe(18000);
  });

  it("gives a year-to-date figure through the selected month", () => {
    const asset = { ...base, capitalisationDate: d("2024-04-01") };
    // Through September (6 months of FY2024-25 elapsed) = 18000 of the 36000 annual charge.
    const result = computeAssetDepreciation(asset, 2024, 9);
    expect(result.book.ytdDepreciation).toBe(18000);
    expect(result.book.depreciationForYear).toBe(36000);
  });

  it("never depreciates below the residual value", () => {
    const asset = { ...base, capitalisationDate: d("2024-04-01") };
    // Year 5, two years after full depreciation — should stay flat at residual.
    const result = computeAssetDepreciation(asset, 2028).book;
    expect(result.netBookValue).toBe(12000);
    expect(result.depreciationForYear).toBe(0);
  });
});

describe("book depreciation — WDV", () => {
  it("derives the WDV rate from cost/residual/life and applies it on the reducing balance", () => {
    const asset = {
      totalCapitalisedCost: 100000,
      depreciationMethod: "WDV" as const,
      usefulLifeYears: 5,
      residualValue: 10000,
      capitalisationDate: d("2024-04-01"),
      taxRatePercent: 0,
      disposalDate: null,
      saleProceeds: null,
    };
    // rate = 1 - (10000/100000)^(1/5) ≈ 0.36904
    const year1 = computeAssetDepreciation(asset, 2024).book;
    expect(year1.depreciationForYear).toBeCloseTo(36904.26, 1);
    const year2 = computeAssetDepreciation(asset, 2025).book;
    // Year 2 depreciation applies the same rate to the reduced opening balance.
    expect(year2.openingAccumulatedDepreciation).toBeCloseTo(36904.26, 1);
    expect(year2.depreciationForYear).toBeCloseTo((100000 - 36904.26) * 0.36904, 0);
  });

  it("falls back to SLM when residual value is zero (WDV rate is undefined)", () => {
    const asset = {
      totalCapitalisedCost: 60000,
      depreciationMethod: "WDV" as const,
      usefulLifeYears: 3,
      residualValue: 0,
      capitalisationDate: d("2024-04-01"),
      taxRatePercent: 0,
      disposalDate: null,
      saleProceeds: null,
    };
    const result = computeAssetDepreciation(asset, 2024).book;
    expect(result.methodFallback).toBe(true);
    expect(result.methodUsed).toBe("SLM");
    expect(result.depreciationForYear).toBe(20000); // 60000 / 3
  });
});

describe("tax block depreciation (Income Tax Act WDV + 180-day rule)", () => {
  const base = {
    totalCapitalisedCost: 100000,
    depreciationMethod: "SLM" as const,
    usefulLifeYears: 5,
    residualValue: 10000,
    disposalDate: null,
    saleProceeds: null,
  };

  it("applies half the rate when used under 180 days in the acquisition year", () => {
    // 1 Nov to 31 Mar = 151 days, under 180.
    const asset = { ...base, capitalisationDate: d("2024-11-01"), taxRatePercent: 40 };
    const result = computeAssetDepreciation(asset, 2024).tax;
    expect(result.taxDepreciation).toBe(20000); // 100000 * 40% * 0.5
  });

  it("applies the full rate when used 180 days or more in the acquisition year", () => {
    // 1 Aug to 31 Mar = 243 days, at or over 180.
    const asset = { ...base, capitalisationDate: d("2024-08-01"), taxRatePercent: 40 };
    const result = computeAssetDepreciation(asset, 2024).tax;
    expect(result.taxDepreciation).toBe(40000); // 100000 * 40%, no proration
  });

  it("applies the full rate on the reduced WDV in later years, with no month proration", () => {
    const asset = { ...base, capitalisationDate: d("2024-04-01"), taxRatePercent: 40 };
    const year1 = computeAssetDepreciation(asset, 2024).tax;
    expect(year1.taxDepreciation).toBe(40000);
    expect(year1.closingWdv).toBe(60000);
    const year2 = computeAssetDepreciation(asset, 2025).tax;
    expect(year2.openingWdv).toBe(60000);
    expect(year2.taxDepreciation).toBe(24000); // 60000 * 40%
    expect(year2.closingWdv).toBe(36000);
  });
});

describe("disposal", () => {
  it("computes book profit/loss on disposal against the book NBV at disposal", () => {
    const asset = {
      totalCapitalisedCost: 120000,
      depreciationMethod: "SLM" as const,
      usefulLifeYears: 3,
      residualValue: 12000,
      capitalisationDate: d("2024-04-01"),
      taxRatePercent: 0,
      disposalDate: d("2025-09-15"),
      saleProceeds: 70000,
    };
    // At disposal (mid FY2025-26, 6 months used): accum dep = 36000 (FY24-25) + 18000 (6 months) = 54000.
    // Book NBV at disposal = 120000 - 54000 = 66000. Profit = 70000 - 66000 = 4000.
    const result = computeAssetDepreciation(asset, 2025);
    expect(result.book.accumulatedDepreciationOnDisposal).toBe(54000);
    expect(result.profitLossOnDisposal).toBe(4000);
  });
});
