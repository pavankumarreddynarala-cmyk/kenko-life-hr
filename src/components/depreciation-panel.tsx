"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSessionUser } from "@/components/session-context";
import { requestJson } from "@/lib/client-api";
import { MONTH_NAMES, MONTH_ORDER } from "@/lib/depreciation-engine";

type Year = { fy: number; label: string };
type MonthCharge = { month: number; label: string; held: number; days: number; charge: number; raw: number };
type Row = {
  id: string; faId: string; description: string; category: string; cost: number; residual: number; lifeYears: number; depreciable: number;
  annualRate: number; daysHeld: number; fyDays: number; fyCharge: number; months: MonthCharge[]; selectedTotal: number;
  openingAccumulated: number; closingAccumulated: number; netBookValue: number; note?: string;
};
type TaxRow = { block: string; rate: number; opening: number; additionsFull: number; additionsHalf: number; sales: number; depreciation: number; closing: number; note?: string };
type Result = {
  fy: number; label: string; fyDays: number; months: number[];
  books: { rows: Row[]; totals: { cost: number; fyCharge: number; selectedTotal: number; closingAccumulated: number; netBookValue: number; perMonth: { month: number; charge: number }[] } };
  tax: { blocks: TaxRow[]; total: number };
  warnings: string[];
};

const money = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DepreciationPanel() {
  const [years, setYears] = useState<Year[]>([]);
  const [fy, setFy] = useState<number | null>(null);
  const [months, setMonths] = useState<number[]>([...MONTH_ORDER]);
  const [basis, setBasis] = useState<"books" | "tax">("books");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(true);
  const user = useSessionUser();
  // Adding a year changes a shared setting: Admin, CEO, COO and CFO only (the server enforces it).
  const canAdd = ["ADMIN", "CEO", "COO", "CFO"].includes(user.role);

  useEffect(() => {
    requestJson<{ years: Year[]; currentFy: number }>("/api/asset-years", { cache: "no-store" })
      .then((body) => {
        setYears(body.years);
        setFy(body.currentFy);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "The year list could not be loaded."));
  }, []);

  const key = months.join(",");
  const load = useCallback(async () => {
    if (fy === null) return;
    setLoading(true);
    setError("");
    try {
      setResult(await requestJson<Result>(`/api/assets/depreciation?fy=${fy}&months=${key}`, { cache: "no-store" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The depreciation could not be calculated.");
    } finally {
      setLoading(false);
    }
  }, [fy, key]);
  useEffect(() => void load(), [load]);

  async function addYear() {
    try {
      const body = await requestJson<{ years: Year[] }>("/api/asset-years", { method: "POST" });
      setYears(body.years);
      setFy(body.years[body.years.length - 1].fy); // the new year is selected so the click is visible
    } catch (e) {
      setError(e instanceof Error ? e.message : "The year could not be added.");
    }
  }

  const toggle = (m: number) => setMonths((current) => (current.includes(m) ? current.filter((x) => x !== m) : [...current, m]));
  const monthCols = useMemo(() => MONTH_ORDER.filter((m) => months.includes(m)), [months]);
  const heading = "whitespace-nowrap px-3 py-2";

  return (
    <section className="card mb-5 p-0">
      <button className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>
          <span className="block text-xs font-bold tracking-widest text-kenko-green">DEPRECIATION</span>
          <span className="font-bold">{result ? `FY ${result.label}` : "Financial year"} · {months.length === 12 ? "all months" : `${months.length} month${months.length === 1 ? "" : "s"}`}</span>
        </span>
        <span className="text-sm text-stone-500">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="border-t border-stone-100 p-4">
          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            <div>
              <label className="text-sm font-semibold">
                Financial year (1 April – 31 March)
                <select className="input mt-1" value={fy ?? ""} onChange={(e) => setFy(Number(e.target.value))}>
                  {years.map((y) => <option key={y.fy} value={y.fy}>{y.label}</option>)}
                </select>
              </label>
              {canAdd && <button className="btn mt-2 w-full bg-stone-100" onClick={() => void addYear()}>+ Add next year</button>}
            </div>
            <fieldset>
              <legend className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold">
                Months
                <button className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-normal" onClick={() => setMonths([...MONTH_ORDER])}>Select all</button>
                <button className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-normal" onClick={() => setMonths([])}>Clear</button>
              </legend>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {MONTH_ORDER.map((m) => {
                  const calendarYear = fy === null ? "" : m >= 4 ? fy : fy + 1;
                  return (
                    <label key={m} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${months.includes(m) ? "border-kenko-orange bg-orange-50" : "border-stone-200"}`}>
                      <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={months.includes(m)} onChange={() => toggle(m)} />
                      {MONTH_NAMES[m - 1]} {String(calendarYear).slice(2)}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>

          <div className="mt-4 flex gap-2 border-b border-stone-200">
            {([["books", "Companies Act (books)"], ["tax", "Income Tax (blocks)"]] as const).map(([id, label]) => (
              <button key={id} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${basis === id ? "border-kenko-orange text-kenko-orange" : "border-transparent text-stone-500"}`} onClick={() => setBasis(id)}>{label}</button>
            ))}
          </div>

          {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
          {loading && <p className="py-8 text-center text-sm text-stone-500">Calculating…</p>}

          {!loading && result && basis === "books" && (
            <div className="mt-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-stone-50 p-3"><p className="text-xs text-stone-500">Full-year charge FY {result.label} (on days)</p><p className="text-xl font-bold">₹ {money(result.books.totals.fyCharge)}</p></div>
                <div className="rounded-xl bg-orange-50 p-3"><p className="text-xs text-stone-500">Selected months total</p><p className="text-xl font-bold text-kenko-orange">₹ {money(result.books.totals.selectedTotal)}</p></div>
                <div className="rounded-xl bg-stone-50 p-3"><p className="text-xs text-stone-500">Net book value at year end</p><p className="text-xl font-bold">₹ {money(result.books.totals.netBookValue)}</p></div>
              </div>
              <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200">
                <table className="w-max min-w-full">
                  <thead>
                    <tr>
                      {["Asset ID", "Description", "Cost", "Residual", "Life (yrs)", "Annual", "Days held", "Full-year charge"].map((h) => <th key={h} className={heading}>{h}</th>)}
                      {monthCols.map((m) => <th key={m} className={`${heading} text-right`}>{MONTH_NAMES[m - 1]}</th>)}
                      <th className={`${heading} text-right`}>Selected total</th>
                      <th className={`${heading} text-right`}>Opening acc. dep.</th>
                      <th className={`${heading} text-right`}>Closing acc. dep.</th>
                      <th className={`${heading} text-right`}>NBV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.books.rows.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap px-3 py-2 font-medium">{r.faId}</td>
                        <td className="max-w-56 truncate px-3 py-2" title={r.note ? `${r.description} — ${r.note}` : r.description}>{r.description}{r.note && <span className="ml-1 text-xs text-orange-700">({r.note})</span>}</td>
                        <td className="px-3 py-2 text-right">{money(r.cost)}</td>
                        <td className="px-3 py-2 text-right">{money(r.residual)}</td>
                        <td className="px-3 py-2 text-right">{r.lifeYears}</td>
                        <td className="px-3 py-2 text-right">{money(r.annualRate)}</td>
                        <td className="px-3 py-2 text-right">{r.daysHeld}/{r.fyDays}</td>
                        <td className="px-3 py-2 text-right">{money(r.fyCharge)}</td>
                        {monthCols.map((m) => {
                          const c = r.months.find((x) => x.month === m);
                          return <td key={m} className="px-3 py-2 text-right" title={c && c.held < c.days ? `${c.held} of ${c.days} days held` : undefined}>{c && c.charge ? money(c.charge) : "–"}</td>;
                        })}
                        <td className="px-3 py-2 text-right font-semibold">{money(r.selectedTotal)}</td>
                        <td className="px-3 py-2 text-right">{money(r.openingAccumulated)}</td>
                        <td className="px-3 py-2 text-right">{money(r.closingAccumulated)}</td>
                        <td className="px-3 py-2 text-right">{money(r.netBookValue)}</td>
                      </tr>
                    ))}
                    {!result.books.rows.length && <tr><td className="px-3 py-8 text-center text-stone-500" colSpan={12 + monthCols.length}>No depreciable assets yet.</td></tr>}
                  </tbody>
                  {result.books.rows.length > 0 && (
                    <tfoot>
                      <tr className="bg-stone-50 font-semibold">
                        <td className="px-3 py-2" colSpan={2}>Total</td>
                        <td className="px-3 py-2 text-right">{money(result.books.totals.cost)}</td>
                        <td colSpan={4} />
                        <td className="px-3 py-2 text-right">{money(result.books.totals.fyCharge)}</td>
                        {monthCols.map((m) => <td key={m} className="px-3 py-2 text-right">{money(result.books.totals.perMonth.find((x) => x.month === m)?.charge ?? 0)}</td>)}
                        <td className="px-3 py-2 text-right">{money(result.books.totals.selectedTotal)}</td>
                        <td />
                        <td className="px-3 py-2 text-right">{money(result.books.totals.closingAccumulated)}</td>
                        <td className="px-3 py-2 text-right">{money(result.books.totals.netBookValue)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <p className="mt-2 text-xs text-stone-500">Straight line to residual value. Full-year charge uses actual days held ÷ {result.fyDays}. Each full month is annual ÷ 12; part months are prorated by days held.</p>
            </div>
          )}

          {!loading && result && basis === "tax" && (
            <div className="mt-3">
              <div className="rounded-xl bg-orange-50 p-3 sm:w-72"><p className="text-xs text-stone-500">Total tax depreciation FY {result.label}</p><p className="text-xl font-bold text-kenko-orange">₹ {money(result.tax.total)}</p></div>
              <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200">
                <table className="w-max min-w-full">
                  <thead><tr>{["Block", "Rate %", "Opening WDV", "Additions (≥180 days)", "Additions (<180 days, half rate)", "Sale value", "Depreciation", "Closing WDV"].map((h) => <th key={h} className={heading}>{h}</th>)}</tr></thead>
                  <tbody>
                    {result.tax.blocks.map((b) => (
                      <tr key={b.block}>
                        <td className="whitespace-nowrap px-3 py-2 font-medium">{b.block}{b.note && <span className="ml-1 text-xs text-orange-700">({b.note})</span>}</td>
                        <td className="px-3 py-2 text-right">{b.rate}</td>
                        <td className="px-3 py-2 text-right">{money(b.opening)}</td>
                        <td className="px-3 py-2 text-right">{money(b.additionsFull)}</td>
                        <td className="px-3 py-2 text-right">{money(b.additionsHalf)}</td>
                        <td className="px-3 py-2 text-right">{money(b.sales)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{money(b.depreciation)}</td>
                        <td className="px-3 py-2 text-right">{money(b.closing)}</td>
                      </tr>
                    ))}
                    {!result.tax.blocks.length && <tr><td className="px-3 py-8 text-center text-stone-500" colSpan={8}>No assets in any tax block for this year.</td></tr>}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-stone-500">Written down value by block. Assets used fewer than 180 days in the year get half the rate; sale value is deducted from the block. The month view applies to the Companies Act figures only.</p>
            </div>
          )}

          {!loading && result && result.warnings.length > 0 && (
            <details className="mt-3 rounded-lg bg-orange-50 p-3 text-sm text-orange-900">
              <summary className="cursor-pointer font-semibold">{result.warnings.length} data warning{result.warnings.length === 1 ? "" : "s"}</summary>
              <ul className="mt-2 list-disc pl-5">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
