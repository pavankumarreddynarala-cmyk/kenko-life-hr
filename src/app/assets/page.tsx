"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Shell } from "@/components/shell";
import { FilterableTable, TableColumn } from "@/components/filterable-table";

type MasterItem = { id: string; name: string; code: string };
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
};

const groups: { title: string; fields: [string, string][] }[] = [
  { title: "Basic identification", fields: [["faId", "Asset ID"], ["category", "Asset Category"], ["description", "Asset Description"], ["makeModel", "Make / Model"], ["serialNo", "Serial No."]] },
  { title: "Purchase details", fields: [["vendorName", "Vendor Name"], ["invoiceNo", "Invoice No."], ["invoiceDate", "Invoice Date"], ["capitalisationDate", "Capitalisation Date"], ["poGrnNo", "PO / GRN No."]] },
  { title: "Location & responsibility", fields: [["companyId", "Company"], ["locationId", "Location"], ["departmentId", "Department"], ["costCentreId", "Cost Centre"]] },
  { title: "Cost", fields: [["purchaseCost", "Purchase Cost"], ["freight", "Freight"], ["installationCost", "Installation / Erection"], ["otherCost", "Other Direct Cost"], ["totalCapitalisedCost", "Total Capitalised Cost"], ["gstAmount", "GST Amount"], ["itcEligible", "ITC Eligible"], ["itcAvailed", "ITC Availed"]] },
  { title: "Depreciation – Books", fields: [["depreciationMethod", "Depreciation Method"], ["usefulLife", "Useful Life"], ["residualValue", "Residual Value"], ["openingGrossBlock", "Opening Gross Block"], ["additions", "Additions"], ["disposals", "Disposals"], ["closingGrossBlock", "Closing Gross Block"], ["openingAccumDep", "Opening Accumulated Depreciation"], ["depreciationYear", "Depreciation for Year"], ["accumDepDisposal", "Accumulated Depreciation on Disposal"], ["closingAccumDep", "Closing Accumulated Depreciation"], ["netBookValue", "Net Book Value"]] },
  { title: "Depreciation – Income Tax", fields: [["taxBlock", "Income-tax Block"], ["openingWdv", "Opening WDV"], ["taxAdditions", "Tax Additions"], ["taxDisposals", "Tax Disposals"], ["wdvBeforeDepreciation", "WDV before Depreciation"], ["taxRate", "Tax Depreciation Rate"], ["taxDepreciation", "Tax Depreciation"], ["closingWdv", "Closing WDV"]] },
  { title: "Disposal / verification", fields: [["disposalDate", "Disposal Date"], ["disposalMethod", "Disposal Method"], ["saleProceeds", "Sale Proceeds"], ["profitLossOnDisposal", "Profit / Loss on Disposal"], ["verificationDate", "Verification Date"], ["verificationStatus", "Verification Status"]] },
];
const fields = groups.flatMap((group) => group.fields);
const dateKeys = ["invoiceDate", "capitalisationDate", "disposalDate", "verificationDate"];
const textKeys = ["faId", "category", "description", "makeModel", "serialNo", "vendorName", "invoiceNo", "poGrnNo", "depreciationMethod", "taxBlock", "disposalMethod", "verificationStatus"];
const masterFields: Record<string, string> = { companyId: "company", locationId: "location", departmentId: "department", costCentreId: "costCentre" };

function format(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
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
  return format(asset[key]);
}

export default function AssetsPage() {
  const [rows, setRows] = useState<Asset[]>([]);
  const [masters, setMasters] = useState<Record<string, MasterItem[]>>({});
  const [editing, setEditing] = useState<Partial<Asset> | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [assetResponse, masterResponse] = await Promise.all([
      fetch("/api/assets", { cache: "no-store" }),
      fetch("/api/masters", { cache: "no-store" }),
    ]);
    const [assets, masterValues] = await Promise.all([assetResponse.json(), masterResponse.json()]);
    setRows(assets.data ?? []);
    setMasters(masterValues.data ?? {});
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo<TableColumn<Asset>[]>(
    () => [
      { key: "row", label: "S.No", render: (_, index) => index + 1, filterValue: (_, index) => index + 1 },
      ...fields.map(([key, label]) => ({
        key,
        label,
        render: (asset: Asset) => display(asset, key),
        filterValue: (asset: Asset) => display(asset, key),
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
      {
        key: "qr",
        label: "QR Code",
        filterValue: (asset: Asset) => asset.faId,
        render: (asset: Asset) =>
          asset.qr ? (
            <div className="flex items-center gap-2">
              {/* The authenticated endpoint supplies the printable, Asset-ID-labelled artwork. */}
              <Image unoptimized width={48} height={48} className="h-12 w-12 rounded border bg-white" src={`/api/qr/${asset.qr.token}`} alt={`QR code for ${asset.faId}`} />
              <div className="flex flex-col text-xs">
                <a className="text-kenko-green underline" href={`/qr/${asset.qr.token}`} target="_blank">View details</a>
                <a className="text-kenko-orange underline" href={`/api/qr/${asset.qr.token}?download=1`}>Download</a>
              </div>
            </div>
          ) : "Pending",
      },
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
    ],
    [],
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
    setNotice(editing.id ? "Asset updated." : "Asset created with a downloadable QR code.");
    await load();
  }

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Asset Register</h2>
          <p className="text-sm text-stone-500">Capitalisation, custody, depreciation, disposal, and QR identification.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => setEditing({ status: "AVAILABLE", itcEligible: false })}>+ Add asset</button>
          <a className="btn-green" href="/api/export?type=assets">Export Excel</a>
        </div>
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
                  {group.fields.map(([key, label]) => (
                    <label className="text-sm" key={key}>
                      {label}
                      {key === "itcEligible" ? (
                        <select className="input mt-1" value={editing.itcEligible ? "yes" : "no"} onChange={(event) => setEditing({ ...editing, itcEligible: event.target.value === "yes" })}>
                          <option value="no">No</option>
                          <option value="yes">Yes</option>
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
                  ))}
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
