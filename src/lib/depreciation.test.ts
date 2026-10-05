import { describe, expect, it } from "vitest";
import { BooksAsset, computeBooks, computeTaxBlocks, currentFy, fyDays, fyLabel, fyOf } from "./depreciation";

const d = (s: string) => Date.parse(s + "T00:00:00Z");
const ALL = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
const base = (over: Partial<BooksAsset> = {}): BooksAsset => ({
  id: "a", faId: "FA1", description: "Laptop", category: "Computers", cost: 120000, residual: 6000, lifeYears: 5,
  putToUse: d("2026-10-01"), disposal: null, ...over,
});

describe("financial year helpers", () => {
  it("labels and identifies FYs on a 1 April to 31 March basis", () => {
    expect(fyLabel(2019)).toBe("2019-20");
    expect(fyLabel(2026)).toBe("2026-27");
    expect(fyOf(d("2027-03-31"))).toBe(2026);
    expect(fyOf(d("2027-04-01"))).toBe(2027);
    expect(currentFy(new Date("2026-10-05"))).toBe(2026);
    expect(currentFy(new Date("2027-02-10"))).toBe(2026);
  });
  it("uses 366 days only when 29 February falls in the FY", () => {
    expect(fyDays(2023)).toBe(366); // Apr 2023 - Mar 2024 contains 29 Feb 2024
    expect(fyDays(2024)).toBe(365);
    expect(fyDays(2026)).toBe(365);
  });
});

describe("Companies Act worked example (brief 8.3)", () => {
  const r = computeBooks(base(), 2026, ALL);
  it("matches every figure", () => {
    expect(r.depreciable).toBe(114000);
    expect(r.annualRate).toBe(22800);
    expect(r.daysHeld).toBe(182);
    expect(r.fyCharge).toBe(11368.77);
    expect(r.months.find((m) => m.month === 10)?.charge).toBe(1900);
  });
  it("shows nil before the put-to-use month and monthly 1900 after", () => {
    expect(r.months.filter((m) => m.charge === 0).map((m) => m.month)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(r.selectedTotal).toBe(11400);
  });
});

describe("test cases from brief 8.4", () => {
  const full = base({ putToUse: d("2020-04-01") });
  it("full-year asset, all 12 months ticked equals the annual figure", () => {
    const r = computeBooks(full, 2022, ALL);
    expect(r.selectedTotal).toBe(22800);
    expect(r.fyCharge).toBe(22800);
  });
  it("12 months equal the annual figure exactly even when the monthly figure has paise", () => {
    const odd = base({ cost: 200000, residual: 10000, putToUse: d("2024-04-01") }); // 190000 / 5 = 38000 -> 3166.666.. a month
    const r = computeBooks(odd, 2026, ALL);
    expect(r.selectedTotal).toBe(38000);
    expect(r.fyCharge).toBe(38000);
  });
  it("full-year asset, 3 months ticked equals three monthly figures", () => {
    expect(computeBooks(full, 2022, [4, 5, 6]).selectedTotal).toBe(5700);
  });
  it("asset added mid-year is charged only from the date of use", () => {
    const r = computeBooks(base({ putToUse: d("2026-10-16") }), 2026, ALL);
    expect(r.months.find((m) => m.month === 9)?.charge).toBe(0);
    expect(r.months.find((m) => m.month === 10)?.charge).toBe(Math.round(1900 * (16 / 31) * 100) / 100);
    expect(r.daysHeld).toBe(167);
  });
  it("asset sold mid-year is charged only up to the date of disposal", () => {
    const r = computeBooks(base({ putToUse: d("2024-04-01") }), 2026, ALL);
    const sold = computeBooks(base({ putToUse: d("2024-04-01"), disposal: d("2026-09-15") }), 2026, ALL);
    expect(r.months.every((m) => m.charge === 1900)).toBe(true);
    expect(sold.months.find((m) => m.month === 9)?.charge).toBe(Math.round(1900 * (15 / 30) * 100) / 100);
    expect(sold.months.filter((m) => m.month > 9 || m.month < 4).every((m) => m.charge === 0)).toBe(true);
    expect(sold.daysHeld).toBe(168);
    expect(sold.netBookValue).toBe(0);
  });
  it("asset whose life has ended stops at the residual value", () => {
    const old = base({ putToUse: d("2018-04-01"), cost: 120000 });
    const r = computeBooks(old, 2024, ALL); // life ended 31 Mar 2023
    expect(r.fyCharge).toBe(0);
    expect(r.selectedTotal).toBe(0);
    expect(r.openingAccumulated).toBe(114000);
    expect(r.netBookValue).toBe(6000);
    // in the year the life ends the charge trues up exactly to the residual value
    const last = computeBooks(old, 2022, ALL);
    expect(last.closingAccumulated).toBe(114000);
  });
  it("never depreciates below residual value even with all months ticked in the final year", () => {
    const r = computeBooks(base({ putToUse: d("2021-10-01") }), 2026, ALL); // ends 30 Sep 2026
    expect(r.closingAccumulated).toBeLessThanOrEqual(114000);
    expect(r.netBookValue).toBeGreaterThanOrEqual(6000);
  });
  it("leap-year FY uses 366 as the denominator", () => {
    const r = computeBooks(base({ putToUse: d("2023-10-01") }), 2023, ALL);
    expect(r.fyDays).toBe(366);
    expect(r.daysHeld).toBe(183);
    expect(r.fyCharge).toBe(Math.round(((22800 * 183) / 366) * 100) / 100);
  });
  it("changing the year or month selection changes the result", () => {
    const a = computeBooks(full, 2022, [4]).selectedTotal;
    const b = computeBooks(full, 2022, [4, 5]).selectedTotal;
    const c = computeBooks(base({ putToUse: d("2023-04-01") }), 2022, ALL).selectedTotal;
    expect(a).toBe(1900);
    expect(b).toBe(3800);
    expect(c).toBe(0);
  });
  it("asset added after the selected period shows nil without error", () => {
    const r = computeBooks(base({ putToUse: d("2027-06-01") }), 2026, ALL);
    expect(r.fyCharge).toBe(0);
    expect(r.selectedTotal).toBe(0);
    expect(r.netBookValue).toBe(120000);
    expect(r.note).toMatch(/after this financial year/);
  });
  it("asset with no capitalisation date is not depreciated and says why", () => {
    const r = computeBooks(base({ putToUse: null }), 2026, ALL);
    expect(r.fyCharge).toBe(0);
    expect(r.note).toMatch(/No capitalisation date/);
  });
});

describe("Income Tax block method", () => {
  const blocks = [{ name: "Computers", rate: 40 }];
  const mk = (id: string, put: string, cost: number, extra: Partial<{ disposal: number; saleProceeds: number }> = {}) => ({
    id, block: "Computers", cost, putToUse: d(put), disposal: extra.disposal ?? null, saleProceeds: extra.saleProceeds ?? 0,
  });
  it("charges half rate on assets used fewer than 180 days", () => {
    const r = computeTaxBlocks([mk("1", "2026-10-01", 100000)], blocks, 2026).blocks[0]; // 182 days: full
    expect(r.depreciation).toBe(40000);
    const h = computeTaxBlocks([mk("1", "2027-01-01", 100000)], blocks, 2026).blocks[0]; // 90 days: half
    expect(h.depreciation).toBe(20000);
    expect(h.additionsHalf).toBe(100000);
  });
  it("rolls WDV forward year to year", () => {
    const r = computeTaxBlocks([mk("1", "2025-05-01", 100000)], blocks, 2026).blocks[0];
    expect(r.opening).toBe(60000);
    expect(r.depreciation).toBe(24000);
    expect(r.closing).toBe(36000);
  });
  it("deducts sale value from the block WDV", () => {
    const r = computeTaxBlocks(
      [mk("1", "2025-05-01", 100000), mk("2", "2025-06-01", 50000, { disposal: d("2026-08-01"), saleProceeds: 10000 })],
      blocks, 2026,
    ).blocks[0];
    expect(r.sales).toBe(10000);
    expect(r.opening).toBe(90000);
    expect(r.depreciation).toBe(0.4 * 80000);
  });
  it("reports assets whose block is missing", () => {
    const out = computeTaxBlocks([{ id: "x", block: null, cost: 1, putToUse: d("2026-05-01"), disposal: null, saleProceeds: 0 }], blocks, 2026);
    expect(out.unassigned).toEqual(["x"]);
    expect(out.blocks).toEqual([]);
  });
});
