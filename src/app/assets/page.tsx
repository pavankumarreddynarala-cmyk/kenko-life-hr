"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { Shell } from "@/components/shell";
import { FilterableTable, TableColumn } from "@/components/filterable-table";

type MasterItem = { id: string; name: string; code: string };
type PeriodFigure = {
  book: { financialYear: string; depreciationForYear: number; ytdDepreciation: number; netBookValue: number; closingAccumulatedDepreciation: number };
  tax: { financialYear: string; taxDepreciation: number; closingWdv: number };
};
type Asset = Record<string, unknown> & {
  id: string;
  faId: string;
  category: string;
  description: string;
  qr?: { token: string };
  company?: MasterItem;
  location?: MasterItem;
  department?: MasterItem;
  costCentre?: MasterItem;
  assignments?: Array<{ employee?: { permanentId: string; name: string }; custodianName?: string }>;
  depreciationByYear?: Record<string, PeriodFigure>;
};

type FieldDef = { key: string; label: string; computed?: boolean };
const groups: { title: string; fields: FieldDef[] }[] = [
  {
    title: "Group 1 — Asset Identification",
    fields: [
      { key: "faId", label: "Asset ID" },
      { key: "category", label: "Asset Category" },
      { key: "description", label: "Asset Description" },
      { key: "makeModel", label: "Make / Model" },
      { key: "serialNo", label: "Serial No." },
    ],
  },
  {
    title: "Group 2 — Purchase / Vendor Information",
    fields: [
      { key: "vendorName", label: "Vendor Name" },
      { key: "invoiceNo", label: "Invoice No." },
      { key: "invoiceDate", label: "Invoice Date" },
      { key: "capitalisationDate", label: "Capitalisation Date" },
      { key: "poGrnNo", label: "PO / GRN No." },
    ],
  },
  {
    title: "Group 3 — Location / Organisation",
    fields: [
      { key: "companyId", label: "Company" },
      { key: "locationId", label: "Location" },
      { key: "departmentId", label: "Department" },
      { key: "costCentreId", label: "Cost Centre" },
    ],
  },
  {
    title: "Group 4 — Cost Information",
    fields: [
      { key: "purchaseCost", label: "Purchase Cost" },
      { key: "freight", label: "Freight" },
      { key: "installationCost", label: "Installation / Erection" },
      { key: "otherCost", label: "Other Direct Cost" },
      { key: "gstAmount", label: "GST Amount" },
      { key: "itcEligible", label: "ITC Eligible" },
      { key: "itcAvailed", label: "ITC Availed" },
      { key: "totalCapitalisedCost", label: "Total Capitalised Cost", computed: true },
    ],
  },
  {
    title: "Group 5 — Depreciation Configuration",
    fields: [
      { key: "depreciationMethod", label: "Depreciation Method" },
      { key: "usefulLife", label: "Useful Life (years)" },
      { key: "residualValue", label: "Residual Value" },
    ],
  },
  {
    title: "Group 6 — Gross Block (auto-calculated)",
    fields: [
      { key: "openingGrossBlock", label: "Opening Gross Block", computed: true },
      { key: "additions", label: "Additions", computed: true },
      { key: "disposals", label: "Disposals", computed: true },
      { key: "closingGrossBlock", label: "Closing Gross Block", computed: true },
    ],
  },
  {
    title: "Group 7 — Accumulated Depreciation (auto-calculated)",
    fields: [
      { key: "openingAccumDep", label: "Opening Accumulated Depreciation", computed: true },
      { key: "depreciationYear", label: "Depreciation for Year", computed: true },
      { key: "accumDepDisposal", label: "Accumulated Depreciation on Disposal", computed: true },
      { key: "closingAccumDep", label: "Closing Accumulated Depreciation", computed: true },
    ],
  },
  {
    title: "Group 8 — Net Book Value (auto-calculated)",
    fields: [{ key: "netBookValue", label: "Net Book Value", computed: true }],
  },
  {
    title: "Group 9 — Income-tax Block, WDV (auto-calculated)",
    fields: [
      { key: "taxBlock", label: "Income-tax Block" },
      { key: "taxRate", label: "Tax Depreciation Rate (%)" },
      { key: "openingWdv", label: "Opening WDV", computed: true },
      { key: "taxAdditions", label: "Tax Additions", computed: true },
      { key: "taxDisposals", label: "Tax Disposals", computed: true },
      { key: "wdvBeforeDepreciation", label: "WDV before Depreciation", computed: true },
      { key: "taxDepreciation", label: "Tax Depreciation", computed: true },
      { key: "closingWdv", label: "Closing WDV", computed: true },
    ],
  },
  {
    title: "Disposal / Verification",
    fields: [
      { key: "disposalDate", label: "Disposal Date" },
      { key: "disposalReason", label: "Disposal Reason" },
      { key: "disposalRemarks", label: "Disposal Remarks" },
      { key: "saleProceeds", label: "Sale Proceeds" },
      { key: "profitLossOnDisposal", label: "Profit / Loss on Disposal", computed: true },
      { key: "verificationDate", label: "Verification Date" },
      { key: "verificationStatus", label: "Verification Status" },
    ],
  },
];
const fields = groups.flatMap((group) => group.fields);
const computedKeys = new Set(fields.filter((field) => field.computed).map((field) => field.key));
const dateKeys = ["invoiceDate", "capitalisationDate", "disposalDate", "verificationDate"];
const textKeys = ["faId", "category", "description", "makeModel", "serialNo", "vendorName", "invoiceNo", "poGrnNo", "taxBlock", "disposalRemarks", "verificationStatus"];
const masterFields: Record<string, string> = { companyId: "company", locationId: "location", departmentId: "department", costCentreId: "costCentre" };
const DISPOSAL_REASONS = ["SOLD", "SCRAPPED", "LOST", "DAMAGED", "WRITTEN_OFF", "TRANSFERRED", "OTHER"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function format(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function money(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : String(value);
}

function date(value: unknown) {
  return value ? new Date(String(value)).toLocaleDateString("en-IN") : "—";
}

function display(asset: Asset, key: string) {
  if (key === "locationId") return asset.location?.name ?? "—";
  if (key === "companyId") return (asset.company as MasterItem | undefined)?.name ?? "—";
  if (key === "departmentId") return asset.department?.name ?? "—";
  if (key === "costCentreId") return asset.costCentre?.name ?? "—";
  if (key === "itcEligible") return asset.itcEligible ? "Yes" : "No";
  if (dateKeys.includes(key)) return date(asset[key]);
  if (computedKeys.has(key) && key !== "totalCapitalisedCost") return money(asset[key]);
  if (["purchaseCost", "freight", "installationCost", "otherCost", "gstAmount", "itcAvailed", "residualValue", "saleProceeds", "totalCapitalisedCost"].includes(key)) return money(asset[key]);
  return format(asset[key]);
}

const currentFy = (() => {
  const now = new Date();
  return now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
})();

export default function AssetsPage() {
  return (
    <Suspense fallback={null}>
      <AssetsPageInner />
    </Suspense>
  );
}

function AssetsPageInner() {
  const [rows, setRows] = useState<Asset[]>([]);
  const [masters, setMasters] = useState<Record<string, MasterItem[]>>({});
  const [editing, setEditing] = useState<Partial<Asset> | null>(null);
  const [notice, setNotice] = useState("");

  // Period selection (requirement #8): a single Year + optional Month, OR a multi-year
  // checklist. Either mode recomputes depreciation for the requested period(s) on the
  // fly via the depreciation engine — nothing extra is stored per period.
  const [periodMode, setPeriodMode] = useState<"single" | "multi">("single");
  const [year, setYear] = useState(currentFy);
  const [month, setMonth] = useState<number | "">("");
  const [multiYears, setMultiYears] = useState<number[]>([currentFy]);

  const load = useCallback(async () => {
    const query = new URLSearchParams();
    if (periodMode === "single") {
      query.set("year", String(year));
      if (month) query.set("month", String(month));
    } else if (multiYears.length) {
      query.set("years", multiYears.join(","));
    }
    const [assetResponse, masterResponse] = await Promise.all([
      fetch(`/api/assets?${query.toString()}`, { cache: "no-store" }),
      fetch("/api/masters", { cache: "no-store" }),
    ]);
    const [assets, masterValues] = await Promise.all([assetResponse.json(), masterResponse.json()]);
    setRows(assets.data ?? []);
    setMasters(masterValues.data ?? {});
  }, [periodMode, year, month, multiYears]);

  const searchParams = useSearchParams();

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("new") === "1") setEditing({ status: "AVAILABLE", itcEligible: false });
  }, [searchParams]);

  const yearChoices = useMemo(() => {
    const years = new Set<number>();
    for (let y = currentFy - 5; y <= currentFy + 1; y++) years.add(y);
    return Array.from(years).sort((a, b) => a - b);
  }, []);

  const periodColumns = useMemo<TableColumn<Asset>[]>(() => {
    if (periodMode === "single") {
      const figure = (asset: Asset) => asset.depreciationByYear?.[String(year)];
      return [
        {
          key: "periodDep",
          label: month ? `YTD Depreciation (thru ${MONTHS[month - 1]} FY${figure(rows[0])?.book.financialYear ?? ""})` : "Depreciation for Selected Year",
          render: (asset) => money(month ? figure(asset)?.book.ytdDepreciation : figure(asset)?.book.depreciationForYear),
          filterable: false,
        },
        {
          key: "periodNbv",
          label: "Net Book Value (selected period)",
          render: (asset) => money(figure(asset)?.book.netBookValue),
          filterable: false,
        },
        {
          key: "periodTaxDep",
          label: "Tax Depreciation (selected year)",
          render: (asset) => money(figure(asset)?.tax.taxDepreciation),
          filterable: false,
        },
      ];
    }
    return multiYears
      .sort((a, b) => a - b)
      .map((y) => ({
        key: `year-${y}`,
        label: `Depreciation FY ${y}-${String((y + 1) % 100).padStart(2, "0")}`,
        render: (asset: Asset) => money(asset.depreciationByYear?.[String(y)]?.book.depreciationForYear),
        filterable: false,
      }));
  }, [periodMode, year, month, multiYears, rows]);

  const columns = useMemo<TableColumn<Asset>[]>(
    () => [
      { key: "row", label: "S.No", render: (_, index) => index + 1, filterValue: (_, index) => index + 1 },
      ...fields.map((field) => ({
        key: field.key,
        label: field.label,
        render: (asset: Asset) => display(asset, field.key),
        filterValue: (asset: Asset) => display(asset, field.key),
      })),
      { key: "status", label: "Status", render: (asset: Asset) => format(asset.status), filterValue: (asset: Asset) => asset.status },
      {
        key: "custodian",
        label: "Custodian",
        render: (asset: Asset) => {
          const employee = asset.assignments?.[0]?.employee;
          return employee ? `${employee.permanentId} · ${employee.name}` : asset.assignments?.[0]?.custodianName ?? "Unassigned";
        },
        filterValue: (asset: Asset) => {
          const employee = asset.assignments?.[0]?.employee;
          return employee ? `${employee.permanentId} ${employee.name}` : asset.assignments?.[0]?.custodianName;
        },
      },
      ...periodColumns,
      {
        key: "edit",
        label: "Edit",
        filterable: false,
        render: (asset: Asset) => (
          <button
            className="rounded-md bg-stone-100 px-2 py-1 text-kenko-green"
            onClick={() =>
              setEditing({
                ...asset,
                ...Object.fromEntries(dateKeys.map((key) => [key, asset[key] ? String(asset[key]).slice(0, 10) : ""])),
              })
            }
          >
            Edit
          </button>
        ),
      },
      // QR sits at the extreme end of the row (requirement #13).
      {
        key: "qr",
        label: "QR Code",
        filterValue: (asset: Asset) => asset.faId,
        render: (asset: Asset) =>
          asset.qr ? (
            <div className="flex items-center gap-2">
              <Image unoptimized width={48} height={48} className="h-12 w-12 rounded border bg-white" src={`/api/qr/${asset.qr.token}`} alt={`QR code for ${asset.faId}`} />
              <div className="flex flex-col text-xs">
                <a className="text-kenko-green underline" href={`/qr/${asset.qr.token}`} target="_blank">View details</a>
                <a className="text-kenko-orange underline" href={`/api/qr/${asset.qr.token}?download=1`}>Download</a>
              </div>
            </div>
          ) : "Pending",
      },
    ],
    [periodColumns],
  );

  async function save() {
    if (!editing) return;
    setNotice("");
    const response = await fetch(editing.id ? `/api/assets/${editing.id}` : "/api/assets", {
      method: editing.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    const body = await response.json();
    if (!response.ok) return setNotice(body.error ?? "Unable to save asset");
    setEditing(null);
    setNotice(editing.id ? "Asset updated. Depreciation figures were recalculated automatically." : "Asset created with a downloadable QR code.");
    await load();
  }

  function toggleMultiYear(y: number) {
    setMultiYears((current) => (current.includes(y) ? current.filter((value) => value !== y) : [...current, y].sort((a, b) => a - b)));
  }

  return (
    <Shell>
      <div className="mb-4">
        <h2 className="text-2xl font-bold">Asset Register</h2>
        <p className="text-sm text-stone-500">Capitalisation, custody, automatic depreciation, disposal, and QR identification.</p>
      </div>

      <div className="card mb-4 flex flex-wrap items-end gap-4">
        <div className="flex gap-2">
          <button className={periodMode === "single" ? "btn-primary" : "btn"} onClick={() => setPeriodMode("single")}>Single period</button>
          <button className={periodMode === "multi" ? "btn-primary" : "btn"} onClick={() => setPeriodMode("multi")}>Compare multiple years</button>
        </div>
        {periodMode === "single" ? (
          <>
            <label className="text-sm">
              Year (FY starting April)
              <select className="input mt-1" value={year} onChange={(event) => setYear(Number(event.target.value))}>
                {yearChoices.map((y) => <option key={y} value={y}>FY {y}-{String((y + 1) % 100).padStart(2, "0")}</option>)}
              </select>
            </label>
            <label className="text-sm">
              Month (for YTD depreciation)
              <select className="input mt-1" value={month} onChange={(event) => setMonth(event.target.value ? Number(event.target.value) : "")}>
                <option value="">Full year</option>
                {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
              </select>
            </label>
          </>
        ) : (
          <div>
            <p className="text-sm font-medium">Select years to compare</p>
            <div className="mt-1 flex flex-wrap gap-3">
              {yearChoices.map((y) => (
                <label key={y} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={multiYears.includes(y)} onChange={() => toggleMultiYear(y)} />
                  FY {y}-{String((y + 1) % 100).padStart(2, "0")}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={() => setEditing({ status: "AVAILABLE", itcEligible: false })}>+ Add asset</button>
        <a className="btn-green" href="/api/export?type=assets">Export Excel</a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not page navigation */}
        <a className="btn" href="/api/qr/bulk">Download All QR Codes</a>
      </div>

      <div className="card overflow-hidden p-0">
        <FilterableTable rows={rows} columns={columns} emptyMessage="No assets found." />
      </div>
      {notice && <p className="mt-4 rounded-lg bg-orange-50 p-3 text-sm text-orange-900">{notice}</p>}
      {editing && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
          <section className="mx-auto my-8 max-w-5xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex justify-between">
              <h3 className="text-xl font-bold">{editing.id ? "Edit fixed asset" : "Add fixed asset"}</h3>
              <button aria-label="Close" onClick={() => setEditing(null)}>×</button>
            </div>
            {groups.map((group) => (
              <fieldset className="mt-5" key={group.title}>
                <legend className="font-bold text-kenko-green">{group.title}</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.fields.map((field) => {
                    const key = field.key;
                    const label = field.label;
                    if (field.computed) {
                      return (
                        <div className="text-sm" key={key}>
                          {label}
                          <div className="input mt-1 flex items-center bg-stone-50 text-stone-600">
                            {editing.id ? money(editing[key]) : "Calculated automatically once saved"}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <label className="text-sm" key={key}>
                        {label}
                        {key === "itcEligible" ? (
                          <select className="input mt-1" value={editing.itcEligible ? "yes" : "no"} onChange={(event) => setEditing({ ...editing, itcEligible: event.target.value === "yes" })}>
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                          </select>
                        ) : key === "depreciationMethod" ? (
                          <select className="input mt-1" value={String(editing.depreciationMethod ?? "")} onChange={(event) => setEditing({ ...editing, depreciationMethod: event.target.value })}>
                            <option value="">Select method</option>
                            <option value="SLM">Straight Line Method (SLM)</option>
                            <option value="WDV">Written Down Value (WDV)</option>
                          </select>
                        ) : key === "disposalReason" ? (
                          <select className="input mt-1" value={String(editing.disposalReason ?? "")} onChange={(event) => setEditing({ ...editing, disposalReason: event.target.value })}>
                            <option value="">Select reason</option>
                            {DISPOSAL_REASONS.map((reason) => <option key={reason} value={reason}>{reason.replace("_", " ")}</option>)}
                          </select>
                        ) : masterFields[key] ? (
                          <select className="input mt-1" value={String(editing[key] ?? "")} onChange={(event) => setEditing({ ...editing, [key]: event.target.value })}>
                            <option value="">Select {label.toLowerCase()}</option>
                            {(masters[masterFields[key]] ?? []).map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}
                          </select>
                        ) : (
                          <input
                            required={["faId", "category", "description"].includes(key)}
                            disabled={key === "faId" && Boolean(editing.id)}
                            className="input mt-1 disabled:bg-stone-100"
                            type={dateKeys.includes(key) ? "date" : textKeys.includes(key) ? "text" : "number"}
                            min={textKeys.includes(key) || dateKeys.includes(key) ? undefined : 0}
                            step={key === "usefulLife" ? 1 : "0.01"}
                            value={String(editing[key] ?? "")}
                            onChange={(event) => setEditing({ ...editing, [key]: event.target.value })}
                          />
                        )}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            <label className="mt-5 block text-sm">
              Asset status
              <select className="input mt-1" value={String(editing.status ?? "AVAILABLE")} onChange={(event) => setEditing({ ...editing, status: event.target.value })}>
                {editing.status === "ASSIGNED" && <option value="ASSIGNED">ASSIGNED (managed by transfers)</option>}
                {editing.status === "PENDING_TRANSFER" && <option value="PENDING_TRANSFER">PENDING TRANSFER (managed by requests)</option>}
                {["AVAILABLE", "UNDER_REPAIR", "DISPOSED"].map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <p className="mt-4 rounded-lg bg-green-50 p-3 text-xs text-green-900">
              Total capitalised cost, gross block, accumulated depreciation, net book value, and the income-tax WDV
              block are calculated automatically from the cost, useful life, residual value, and dates above — they
              are not entered manually.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" onClick={save}>Save asset</button>
            </div>
          </section>
        </div>
      )}
    </Shell>
  );
}
