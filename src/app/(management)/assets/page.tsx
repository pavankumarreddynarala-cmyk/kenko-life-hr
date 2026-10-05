"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { FilterableTable, TableColumn } from "@/components/filterable-table";
import { ConfirmDialog, Field, inputClass, Modal, RequiredLegend } from "@/components/form";
import { DeletionDetails } from "@/components/deletion-history";
import { useSessionUser } from "@/components/session-context";
import { useToast } from "@/components/toast";
import { fieldErrorMap, jsonBody, requestJson } from "@/lib/client-api";
import { describeMissing, requiredErrors, type FormErrors } from "@/lib/form-validation";
import { FIELD_LABELS } from "@/lib/field-labels";
import { ITC_NOT_ELIGIBLE_MESSAGE } from "@/lib/assets";
import { DepreciationPanel } from "@/components/depreciation-panel";
import { ScanQrButton } from "@/components/qr-scanner";

type MasterItem = { id: string; name: string; code: string };
type Asset = Record<string, unknown> & {
  id: string;
  faId: string;
  category: string;
  description: string;
  qr?: { token: string };
  deletedAt?: string | null;
  deletedByEmail?: string | null;
  deleteReason?: string | null;
  company?: MasterItem;
  location?: MasterItem;
  department?: MasterItem;
  costCentre?: MasterItem;
  assignments?: Array<{ employee?: { permanentId: string; name: string }; custodianName?: string }>;
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
      { key: "itcAvailed", label: "ITC Amount Claimed / Availed" },
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
// Fields the form refuses to submit without (the server enforces the same list).
const REQUIRED = ["faId", "category", "description"] as const;
const LABELS: Record<string, string> = {
  ...FIELD_LABELS,
  ...Object.fromEntries(fields.map((field) => [field.key, field.label])),
};
const ITC_LABEL = "ITC Amount Claimed / Availed";
const computedKeys = new Set(fields.filter((field) => field.computed).map((field) => field.key));
const dateKeys = ["invoiceDate", "capitalisationDate", "disposalDate", "verificationDate"];
const textKeys = ["faId", "category", "description", "makeModel", "serialNo", "vendorName", "invoiceNo", "poGrnNo", "taxBlock", "disposalRemarks", "verificationStatus"];
const masterFields: Record<string, string> = { companyId: "company", locationId: "location", departmentId: "department", costCentreId: "costCentre" };
const DISPOSAL_REASONS = ["SOLD", "SCRAPPED", "LOST", "DAMAGED", "WRITTEN_OFF", "TRANSFERRED", "OTHER"] as const;

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

function stamp(value: unknown) {
  return value ? new Date(String(value)).toLocaleString("en-IN") : "—";
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

export default function AssetsPage() {
  return (
    <Suspense fallback={null}>
      <AssetsPageInner />
    </Suspense>
  );
}


function AssetsPageInner() {
  const user = useSessionUser();
  const toast = useToast();
  const canDelete = user.permissions.deleteAsset;
  const canRestore = user.permissions.restoreAsset;
  const [rows, setRows] = useState<Asset[]>([]);
  const [masters, setMasters] = useState<Record<string, MasterItem[]>>({});
  const [editing, setEditing] = useState<Partial<Asset> | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const [inspecting, setInspecting] = useState<Asset | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [categories, setCategories] = useState<{ name: string; defaultTaxBlock?: string | null; usefulLifeYears?: number; method?: string }[]>([]);
  const [taxBlocks, setTaxBlocks] = useState<{ name: string }[]>([]);

  const load = useCallback(async () => {
    const query = new URLSearchParams();
    if (showDeleted) query.set("deleted", "1");
    try {
      const [assets, masterValues, cats, blocks] = await Promise.all([
        requestJson<{ data: Asset[] }>(`/api/assets?${query.toString()}`, { cache: "no-store" }),
        requestJson<{ data: Record<string, MasterItem[]> }>("/api/masters", { cache: "no-store" }),
        requestJson<{ data: { name: string; defaultTaxBlock?: string | null; usefulLifeYears?: number; method?: string }[] }>("/api/asset-categories", { cache: "no-store" }),
        requestJson<{ data: { name: string }[] }>("/api/tax-blocks", { cache: "no-store" }),
      ]);
      setRows(assets.data ?? []);
      setMasters(masterValues.data ?? {});
      setCategories(cats.data ?? []);
      setTaxBlocks(blocks.data ?? []);
    } catch (error) {
      toast.fromError(error, "Assets could not be loaded");
    }
  }, [showDeleted, toast]);

  const searchParams = useSearchParams();

  useEffect(() => {
    void load();
  }, [load]);

  const openEditor = useCallback((next: Partial<Asset> | null) => {
    setErrors({});
    setEditing(next);
  }, []);

  useEffect(() => {
    if (searchParams.get("new") === "1") openEditor({ status: "AVAILABLE", itcEligible: false });
  }, [searchParams, openEditor]);

  const restore = useCallback(
    async (asset: Asset) => {
      setBusyId(asset.id);
      try {
        await requestJson(`/api/assets/${asset.id}/restore`, { method: "POST" });
        toast.success(`Asset ${asset.faId} is back in the Asset Register.`, { title: "Asset restored" });
        await load();
      } catch (error) {
        toast.fromError(error, "Asset not restored");
      } finally {
        setBusyId(null);
      }
    },
    [load, toast],
  );

  const columns = useMemo<TableColumn<Asset>[]>(
    () => [
      { key: "row", label: "S.No", render: (_, index) => index + 1, filterValue: (_, index) => index + 1 },
      // Each register column sits under the same group heading used in the Add/Edit form.
      ...groups.flatMap((group) =>
        group.fields.map((field) => ({
          key: field.key,
          label: field.label,
          group: group.title,
          render: (asset: Asset) => display(asset, field.key),
          filterValue: (asset: Asset) => display(asset, field.key),
        })),
      ),
      { key: "status", label: "Status", group: "Status & Custody", render: (asset: Asset) => format(asset.status), filterValue: (asset: Asset) => asset.status },
      {
        key: "custodian",
        label: "Custodian",
        group: "Status & Custody",
        render: (asset: Asset) => {
          const employee = asset.assignments?.[0]?.employee;
          return employee ? `${employee.permanentId} · ${employee.name}` : asset.assignments?.[0]?.custodianName ?? "Unassigned";
        },
        filterValue: (asset: Asset) => {
          const employee = asset.assignments?.[0]?.employee;
          return employee ? `${employee.permanentId} ${employee.name}` : asset.assignments?.[0]?.custodianName;
        },
      },
      ...(showDeleted
        ? [
            { key: "deletedAt", label: "Deleted On", group: "Deletion History", render: (asset: Asset) => stamp(asset.deletedAt), filterValue: (asset: Asset) => stamp(asset.deletedAt) },
            { key: "deletedBy", label: "Deleted By", group: "Deletion History", render: (asset: Asset) => format(asset.deletedByEmail), filterValue: (asset: Asset) => asset.deletedByEmail },
            { key: "deleteReason", label: "Reason for Deletion", group: "Deletion History", render: (asset: Asset) => format(asset.deleteReason), filterValue: (asset: Asset) => asset.deleteReason },
          ]
        : []),
      // Edit, then Delete, then the QR code at the extreme end of the row.
      {
        key: "actions",
        label: "Actions",
        filterable: false,
        render: (asset: Asset) =>
          showDeleted ? (
            <div className="flex gap-1">
              <button className="rounded-md bg-stone-100 px-2 py-1 text-kenko-green" onClick={() => setInspecting(asset)}>Details</button>
              <button
                className="rounded-md bg-kenko-green/10 px-2 py-1 text-kenko-green disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canRestore || busyId === asset.id}
                title={canRestore ? undefined : "Only an Admin, CEO or COO can restore assets"}
                onClick={() => restore(asset)}
              >
                {busyId === asset.id ? "Restoring…" : "Restore"}
              </button>
            </div>
          ) : (
            <div className="flex gap-1">
              <button
                className="rounded-md bg-stone-100 px-2 py-1 text-kenko-green"
                onClick={() =>
                  openEditor({
                    ...asset,
                    ...Object.fromEntries(dateKeys.map((key) => [key, asset[key] ? String(asset[key]).slice(0, 10) : ""])),
                  })
                }
              >
                Edit
              </button>
              <button
                className="rounded-md bg-red-50 px-2 py-1 text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canDelete}
                title={canDelete ? "Delete this asset" : "Only an Admin, CEO or COO can delete assets"}
                onClick={() => setDeleting(asset)}
              >
                Delete
              </button>
            </div>
          ),
      },
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
    [showDeleted, canDelete, canRestore, busyId, restore, openEditor],
  );

  async function confirmDelete(reason: string) {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await requestJson(`/api/assets/${deleting.id}`, jsonBody("DELETE", { reason }));
      toast.success(
        `Asset ${deleting.faId} was deleted. It is kept in the deletion history and an Admin, CEO or COO can restore it from “Show deleted assets”.`,
        { title: "Asset deleted" },
      );
      setDeleting(null);
      await load();
    } catch (error) {
      toast.fromError(error, "Asset not deleted");
    } finally {
      setBusyId(null);
    }
  }

  function setField(key: string, value: unknown) {
    setEditing((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: "" } : current));
  }

  // ITC Availed only makes sense when the asset is ITC eligible: switching to "No" clears
  // the amount and locks the field, so an amount can never be saved against a "No".
  function setItcEligible(eligible: boolean) {
    setEditing((current) => ({ ...current, itcEligible: eligible, ...(eligible ? {} : { itcAvailed: 0 }) }));
    setErrors((current) => ({ ...current, itcAvailed: "" }));
  }

  async function save() {
    if (!editing) return;
    const missing = requiredErrors(editing, REQUIRED, LABELS);
    const itcAmount = Number(editing.itcAvailed ?? 0);
    if (!editing.itcEligible && itcAmount > 0) missing.itcAvailed = ITC_NOT_ELIGIBLE_MESSAGE;
    if (Object.keys(missing).length) {
      setErrors(missing);
      const names = describeMissing(missing, { ...LABELS, itcAvailed: ITC_LABEL });
      toast.error(
        missing.itcAvailed && Object.keys(missing).length === 1
          ? ITC_NOT_ELIGIBLE_MESSAGE
          : `Fix these before saving: ${names}.`,
        { title: "Asset not saved" },
      );
      return;
    }
    setSaving(true);
    try {
      await requestJson(editing.id ? `/api/assets/${editing.id}` : "/api/assets", jsonBody(editing.id ? "PATCH" : "POST", editing));
      setEditing(null);
      setErrors({});
      toast.success(
        editing.id ? "Asset updated. Depreciation figures were recalculated automatically." : "Asset created with a downloadable QR code.",
        { title: "Saved" },
      );
      await load();
    } catch (error) {
      setErrors(fieldErrorMap(error));
      toast.fromError(error, "Asset not saved");
    } finally {
      setSaving(false);
    }
  }

  const isRequired = (key: string) => (REQUIRED as readonly string[]).includes(key);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Asset Register</h2>
          <p className="text-sm text-stone-500">Capitalisation, custody, automatic depreciation, disposal, and QR identification.</p>
        </div>
        <ScanQrButton />
      </div>

      <DepreciationPanel />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={showDeleted} onClick={() => openEditor({ status: "AVAILABLE", itcEligible: false })}>+ Add asset</button>
        <a className="btn-green" href="/api/export?type=assets">Export Excel</a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not page navigation */}
        <a className="btn" href="/api/qr/bulk">Download All QR Codes</a>
        <label className="flex items-center gap-2 text-sm text-stone-600 sm:ml-2">
          <input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} />
          Show deleted assets (deletion history)
        </label>
      </div>

      <div className="card overflow-hidden p-0">
        <FilterableTable rows={rows} columns={columns} emptyMessage={showDeleted ? "No deleted assets." : "No assets found."} />
      </div>

      {deleting && (
        <ConfirmDialog
          title="Delete asset?"
          confirmLabel="Delete asset"
          busyLabel="Deleting…"
          busy={busyId === deleting.id}
          reasonLabel="Reason for deletion"
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        >
          You are about to delete asset <strong>{deleting.faId}</strong> ({deleting.description}). It is not erased: it moves to the deletion history with
          your name, the time and the reason below, and an Admin, CEO or COO can restore it. An asset that is currently assigned to someone, or has a
          pending transfer, cannot be deleted until that is resolved.
        </ConfirmDialog>
      )}

      {inspecting && (
        <DeletionDetails
          title={`${inspecting.faId} · ${inspecting.description}`}
          recordType="FixedAsset"
          recordId={inspecting.id}
          deletedAt={inspecting.deletedAt}
          deletedBy={inspecting.deletedByEmail}
          reason={inspecting.deleteReason}
          onClose={() => setInspecting(null)}
          details={[
            ["Asset ID", inspecting.faId],
            ["Category", inspecting.category],
            ["Description", inspecting.description],
            ["Make / model", format(inspecting.makeModel)],
            ["Serial no.", format(inspecting.serialNo)],
            ["Vendor", format(inspecting.vendorName)],
            ["Invoice no.", format(inspecting.invoiceNo)],
            ["Invoice date", date(inspecting.invoiceDate)],
            ["Location", format(inspecting.location?.name)],
            ["Department", format(inspecting.department?.name)],
            ["Cost centre", format(inspecting.costCentre?.name)],
            ["Purchase cost", money(inspecting.purchaseCost)],
            ["Total capitalised cost", money(inspecting.totalCapitalisedCost)],
            ["ITC eligible", inspecting.itcEligible ? "Yes" : "No"],
            ["ITC availed", money(inspecting.itcAvailed)],
            ["Net book value", money(inspecting.netBookValue)],
            ["Status when deleted", format(inspecting.status)],
          ]}
        />
      )}

      {editing && (
        <Modal
          title={editing.id ? "Edit fixed asset" : "Add fixed asset"}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary disabled:opacity-60" disabled={saving} onClick={save}>
                {saving ? "Saving…" : "Save asset"}
              </button>
            </>
          }
        >
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <RequiredLegend />
            {groups.map((group) => (
              <fieldset className="mt-5" key={group.title}>
                <legend className="font-bold text-kenko-green">{group.title}</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.fields.map((field) => {
                    const key = field.key;
                    const label = key === "itcAvailed" ? ITC_LABEL : field.label;
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
                    const error = errors[key];
                    if (key === "itcEligible") {
                      return (
                        <Field key={key} label={label} error={error}>
                          <select className={inputClass(Boolean(error))} value={editing.itcEligible ? "yes" : "no"} onChange={(event) => setItcEligible(event.target.value === "yes")}>
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                          </select>
                        </Field>
                      );
                    }
                    if (key === "itcAvailed") {
                      const eligible = Boolean(editing.itcEligible);
                      return (
                        <Field key={key} label={label} error={error} hint={eligible ? "Enter the input tax credit claimed." : "Locked: set ITC Eligible to Yes to enter an amount."}>
                          <input
                            className={inputClass(Boolean(error), "disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500")}
                            disabled={!eligible}
                            type="number"
                            min={0}
                            step="0.01"
                            value={eligible ? String(editing.itcAvailed ?? "") : "0"}
                            onChange={(event) => setField("itcAvailed", event.target.value)}
                          />
                        </Field>
                      );
                    }
                    return (
                      <Field key={key} label={label} required={isRequired(key)} error={error}>
                        {key === "category" || key === "taxBlock" ? (
                          <select
                            className={inputClass(Boolean(error))}
                            value={String(editing[key] ?? "")}
                            onChange={(event) => {
                              const value = event.target.value;
                              if (key === "category") {
                                const found = categories.find((c) => c.name === value);
                                setEditing((current) => ({
                                  ...current,
                                  category: value,
                                  ...(found && !current?.taxBlock && found.defaultTaxBlock ? { taxBlock: found.defaultTaxBlock } : {}),
                                  ...(found && !current?.usefulLife && found.usefulLifeYears ? { usefulLife: found.usefulLifeYears } : {}),
                                  ...(found && !current?.depreciationMethod && found.method ? { depreciationMethod: found.method } : {}),
                                }));
                                setErrors((current) => (current.category ? { ...current, category: "" } : current));
                              } else setField(key, value);
                            }}
                          >
                            <option value="">{key === "category" ? "Select category" : "Use category default"}</option>
                            {(key === "category" ? categories : taxBlocks).map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
                            {Boolean(editing[key]) && !(key === "category" ? categories : taxBlocks).some((item) => item.name === editing[key]) && <option value={String(editing[key])}>{String(editing[key])}</option>}
                          </select>
                        ) : key === "depreciationMethod" ? (
                          <select className={inputClass(Boolean(error))} value={String(editing.depreciationMethod ?? "")} onChange={(event) => setField("depreciationMethod", event.target.value)}>
                            <option value="">Select method</option>
                            <option value="SLM">Straight Line Method (SLM)</option>
                            <option value="WDV">Written Down Value (WDV)</option>
                          </select>
                        ) : key === "disposalReason" ? (
                          <select className={inputClass(Boolean(error))} value={String(editing.disposalReason ?? "")} onChange={(event) => setField("disposalReason", event.target.value)}>
                            <option value="">Select reason</option>
                            {DISPOSAL_REASONS.map((reason) => <option key={reason} value={reason}>{reason.replace("_", " ")}</option>)}
                          </select>
                        ) : masterFields[key] ? (
                          <select className={inputClass(Boolean(error))} value={String(editing[key] ?? "")} onChange={(event) => setField(key, event.target.value)}>
                            <option value="">Select {label.toLowerCase()}</option>
                            {(masters[masterFields[key]] ?? []).map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}
                          </select>
                        ) : (
                          <input
                            disabled={key === "faId" && Boolean(editing.id)}
                            className={inputClass(Boolean(error), "disabled:bg-stone-100")}
                            type={dateKeys.includes(key) ? "date" : textKeys.includes(key) ? "text" : "number"}
                            min={textKeys.includes(key) || dateKeys.includes(key) ? undefined : 0}
                            step={key === "usefulLife" ? 1 : "0.01"}
                            value={String(editing[key] ?? "")}
                            onChange={(event) => setField(key, event.target.value)}
                          />
                        )}
                      </Field>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            <Field label="Asset status" className="mt-5">
              <select className={inputClass()} value={String(editing.status ?? "AVAILABLE")} onChange={(event) => setField("status", event.target.value)}>
                {editing.status === "ASSIGNED" && <option value="ASSIGNED">ASSIGNED (managed by transfers)</option>}
                {editing.status === "PENDING_TRANSFER" && <option value="PENDING_TRANSFER">PENDING TRANSFER (managed by requests)</option>}
                {["AVAILABLE", "UNDER_REPAIR", "DISPOSED"].map((status) => <option key={status}>{status}</option>)}
              </select>
            </Field>
            <p className="mt-4 rounded-lg bg-green-50 p-3 text-xs text-green-900">
              Total capitalised cost, gross block, accumulated depreciation, net book value, and the income-tax WDV
              block are calculated automatically from the cost, useful life, residual value, and dates above — they
              are not entered manually.
            </p>
            <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
          </form>
        </Modal>
      )}
    </>
  );
}
