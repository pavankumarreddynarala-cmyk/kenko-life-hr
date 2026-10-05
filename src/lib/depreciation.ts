// Depreciation engine (brief R11-R13, section 8). Pure functions, no database access.
// All dates are treated as calendar dates in UTC. A financial year (FY) is identified by the
// calendar year in which it starts: FY 2026 = 1 April 2026 to 31 March 2027 ("2026-27").

const DAY = 86_400_000;
export const FIRST_FY = 2019;
export const MONTH_ORDER = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3] as const; // April..March (calendar month numbers)
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
export const fyStart = (fy: number) => utc(fy, 4, 1);
export const fyEnd = (fy: number) => utc(fy + 1, 3, 31);
export const fyLabel = (fy: number) => `${fy}-${String((fy + 1) % 100).padStart(2, "0")}`;
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
/** Days in the financial year: 366 when 29 February falls inside it, else 365. */
export const fyDays = (fy: number) => (isLeap(fy + 1) ? 366 : 365);
/** The FY that contains the given date. */
export const fyOf = (ms: number) => {
  const d = new Date(ms);
  return d.getUTCMonth() + 1 >= 4 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
};
/** Running financial year today (1 April to 31 March). */
export const currentFy = (now = new Date()) => fyOf(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
/** Calendar start (ms) and number of days of a month inside a FY, by calendar month number. */
export function monthRange(fy: number, month: number) {
  const year = month >= 4 ? fy : fy + 1;
  const start = utc(year, month, 1);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start, end: start + (days - 1) * DAY, days };
}
const inclusiveDays = (from: number, to: number) => (to >= from ? Math.round((to - from) / DAY) + 1 : 0);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const addYearsMinusDay = (ms: number, years: number) => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate()) - DAY;
};

export type BooksAsset = {
  id: string;
  faId: string;
  description: string;
  category: string;
  cost: number;
  residual: number; // absolute residual value
  lifeYears: number;
  putToUse: number | null; // ms
  disposal: number | null; // ms
};

export type MonthCharge = { month: number; label: string; held: number; days: number; charge: number; raw: number };

export type BooksResult = {
  id: string;
  faId: string;
  description: string;
  category: string;
  cost: number;
  residual: number;
  lifeYears: number;
  depreciable: number;
  annualRate: number; // full-year charge: (cost - residual) / life
  daysHeld: number; // days held in the FY
  fyDays: number;
  fyCharge: number; // charge for the whole FY, on a days basis
  months: MonthCharge[]; // ticked months only
  selectedTotal: number;
  openingAccumulated: number;
  closingAccumulated: number;
  netBookValue: number;
  note?: string;
};

/** Days the asset is in use between two dates (inclusive), honouring put-to-use, disposal and end of life. */
function heldDays(a: BooksAsset, from: number, to: number) {
  if (a.putToUse === null) return 0;
  const lifeEnd = addYearsMinusDay(a.putToUse, a.lifeYears);
  const end = Math.min(to, a.disposal ?? to, lifeEnd);
  return inclusiveDays(Math.max(from, a.putToUse), end);
}

/** Charge for one whole FY on the days basis, with a true-up in the year the life ends. */
function fyCharge(a: BooksAsset, fy: number, openingAcc: number) {
  const depreciable = Math.max(0, a.cost - a.residual);
  const annual = a.lifeYears > 0 ? depreciable / a.lifeYears : 0;
  const held = heldDays(a, fyStart(fy), fyEnd(fy));
  if (held === 0 || a.putToUse === null) return 0;
  const lifeEnd = addYearsMinusDay(a.putToUse, a.lifeYears);
  const endsThisYear = lifeEnd >= fyStart(fy) && lifeEnd <= fyEnd(fy) && (a.disposal === null || a.disposal >= lifeEnd);
  const raw = endsThisYear ? depreciable - openingAcc : (annual * held) / fyDays(fy);
  return Math.max(0, Math.min(raw, depreciable - openingAcc));
}

/** Accumulated depreciation at the start of the FY, built year by year from the put-to-use year. */
export function openingAccumulated(a: BooksAsset, fy: number) {
  if (a.putToUse === null) return 0;
  let acc = 0;
  for (let y = fyOf(a.putToUse); y < fy; y++) acc += fyCharge(a, y, acc);
  return acc;
}

export function computeBooks(a: BooksAsset, fy: number, selectedMonths: number[]): BooksResult {
  const depreciable = Math.max(0, a.cost - a.residual);
  const annual = a.lifeYears > 0 ? depreciable / a.lifeYears : 0;
  const opening = openingAccumulated(a, fy);
  const charge = fyCharge(a, fy, opening);
  const daysHeld = heldDays(a, fyStart(fy), fyEnd(fy));

  // Monthly view: a full month held = annual / 12; a part month = annual / 12 prorated by days held.
  // Every month of the FY is walked in order so the "never below residual" cap applies cumulatively.
  let remaining = depreciable - opening;
  const months: MonthCharge[] = [];
  const picked = new Set(selectedMonths);
  for (const month of MONTH_ORDER) {
    const range = monthRange(fy, month);
    const held = heldDays(a, range.start, range.end);
    const raw = held === 0 ? 0 : held === range.days ? annual / 12 : (annual / 12) * (held / range.days);
    const amount = Math.max(0, Math.min(raw, remaining));
    remaining -= amount;
    if (picked.has(month)) months.push({ month, label: MONTH_NAMES[month - 1], held, days: range.days, charge: round2(amount), raw: amount });
  }
  const closing = opening + charge;
  let note: string | undefined;
  if (a.putToUse === null) note = "No capitalisation date; not depreciated";
  else if (a.putToUse > fyEnd(fy)) note = "Put to use after this financial year";
  else if (a.disposal !== null && a.disposal < fyStart(fy)) note = "Disposed before this financial year";
  else if (opening >= depreciable && depreciable > 0) note = "Fully depreciated to residual value";
  return {
    id: a.id,
    faId: a.faId,
    description: a.description,
    category: a.category,
    cost: round2(a.cost),
    residual: round2(a.residual),
    lifeYears: a.lifeYears,
    depreciable: round2(depreciable),
    annualRate: round2(annual),
    daysHeld,
    fyDays: fyDays(fy),
    fyCharge: round2(charge),
    months,
    // Totals add the unrounded monthly figures and round once, so 12 months always equal the annual figure.
    selectedTotal: round2(months.reduce((s, m) => s + m.raw, 0)),
    openingAccumulated: round2(opening),
    closingAccumulated: round2(closing),
    netBookValue: round2(a.disposal !== null && a.disposal <= fyEnd(fy) ? 0 : a.cost - closing),
    note,
  };
}

// ---------------------------------------------------------------- Income Tax (block-wise WDV)

export type TaxAsset = {
  id: string;
  block: string | null;
  cost: number;
  putToUse: number | null;
  disposal: number | null;
  saleProceeds: number;
};
export type TaxBlockRate = { name: string; rate: number };
export type TaxBlockResult = {
  block: string;
  rate: number;
  opening: number;
  additionsFull: number; // used 180 days or more in the year
  additionsHalf: number; // used fewer than 180 days: half rate
  sales: number;
  depreciation: number;
  closing: number;
  note?: string;
};

/** Block depreciation for a FY, rolled forward from the first year any asset entered the block. */
export function computeTaxBlocks(assets: TaxAsset[], blocks: TaxBlockRate[], fy: number): { blocks: TaxBlockResult[]; unassigned: string[] } {
  const unassigned: string[] = [];
  const byBlock = new Map<string, TaxAsset[]>();
  for (const asset of assets) {
    if (asset.putToUse === null) continue;
    if (!asset.block || !blocks.some((b) => b.name === asset.block)) {
      unassigned.push(asset.id);
      continue;
    }
    byBlock.set(asset.block, [...(byBlock.get(asset.block) ?? []), asset]);
  }
  const results: TaxBlockResult[] = [];
  for (const [name, list] of byBlock) {
    const rate = (blocks.find((b) => b.name === name)?.rate ?? 0) / 100;
    const first = Math.min(...list.map((a) => fyOf(a.putToUse as number)));
    if (first > fy) continue;
    let wdv = 0;
    let last: TaxBlockResult | null = null;
    for (let y = first; y <= fy; y++) {
      const added = list.filter((a) => fyOf(a.putToUse as number) === y);
      const additionsFull = added.filter((a) => inclusiveDays(a.putToUse as number, fyEnd(y)) >= 180).reduce((s, a) => s + a.cost, 0);
      const additionsHalf = added.filter((a) => inclusiveDays(a.putToUse as number, fyEnd(y)) < 180).reduce((s, a) => s + a.cost, 0);
      const sales = list.filter((a) => a.disposal !== null && fyOf(a.disposal) === y).reduce((s, a) => s + a.saleProceeds, 0);
      const x = wdv + additionsFull - sales;
      let dep = 0;
      let note: string | undefined;
      if (x >= 0) dep = rate * x + (rate / 2) * additionsHalf;
      else {
        const y2 = additionsHalf + x; // sales exceed opening + full additions: the rest reduces the half-year pool
        dep = y2 > 0 ? (rate / 2) * y2 : 0;
        if (y2 < 0) note = "Sale value exceeds the block: short-term capital gain, WDV nil";
      }
      const closing = Math.max(0, wdv + additionsFull + additionsHalf - sales - dep);
      last = { block: name, rate: rate * 100, opening: round2(wdv), additionsFull: round2(additionsFull), additionsHalf: round2(additionsHalf), sales: round2(sales), depreciation: round2(dep), closing: round2(closing), note };
      wdv = closing;
    }
    if (last) results.push(last);
  }
  return { blocks: results.sort((a, b) => a.block.localeCompare(b.block)), unassigned };
}
