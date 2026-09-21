"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FilterableTable, TableColumn } from "@/components/filterable-table";
import { Field, inputClass, Modal, RequiredLegend } from "@/components/form";
import { useToast } from "@/components/toast";
import { fieldErrorMap, jsonBody, requestJson } from "@/lib/client-api";
import { describeMissing, requiredErrors, type FormErrors } from "@/lib/form-validation";

type Person = { id: string; permanentId: string; name: string };
type Asset = {
  id: string;
  faId: string;
  description: string;
  status: string;
  assignments?: Array<{ employee?: Person }>;
};
type Transfer = {
  id: string;
  asset: Asset;
  sender?: Person;
  receiver: Person;
  kind: string;
  status: string;
  effectiveDate: string;
  registeredDate: string;
  reason?: string;
  createdAt: string;
};

const emptyForm = () => ({
  assetId: "",
  receiverEmployeeCode: "",
  effectiveDate: new Date().toISOString().slice(0, 10),
  registeredDate: new Date().toISOString().slice(0, 10),
  reason: "",
});

// Fields the form refuses to submit without (the server enforces the same list).
const REQUIRED = ["assetId", "receiverEmployeeCode"] as const;
const LABELS = { assetId: "Asset Register item", receiverEmployeeCode: "Receiving Employee ID" };

function date(value: string) {
  return new Date(value).toLocaleDateString("en-IN");
}

export default function TransfersPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Transfer[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Person[]>([]);
  const [editing, setEditing] = useState<(ReturnType<typeof emptyForm> & { id?: string }) | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [transfers, assetRows, employeeRows] = await Promise.all([
        requestJson<{ data: Transfer[] }>("/api/transfers", { cache: "no-store" }),
        requestJson<{ data: Asset[] }>("/api/assets", { cache: "no-store" }),
        requestJson<{ data: Person[] }>("/api/employees", { cache: "no-store" }),
      ]);
      setRows(transfers.data ?? []);
      setAssets(assetRows.data ?? []);
      setEmployees(employeeRows.data ?? []);
    } catch (error) {
      toast.fromError(error, "Transfers could not be loaded");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo<TableColumn<Transfer>[]>(
    () => [
      { key: "asset", label: "Asset ID", render: (row) => row.asset.faId, filterValue: (row) => `${row.asset.faId} ${row.asset.description}` },
      { key: "from", label: "From Employee ID", render: (row) => row.sender ? `${row.sender.permanentId} · ${row.sender.name}` : "Unassigned", filterValue: (row) => `${row.sender?.permanentId} ${row.sender?.name}` },
      { key: "to", label: "To Employee ID", render: (row) => `${row.receiver.permanentId} · ${row.receiver.name}`, filterValue: (row) => `${row.receiver.permanentId} ${row.receiver.name}` },
      { key: "kind", label: "Type", render: (row) => row.kind.replaceAll("_", " "), filterValue: (row) => row.kind },
      { key: "effective", label: "Effective Date", render: (row) => date(row.effectiveDate), filterValue: (row) => date(row.effectiveDate) },
      { key: "registered", label: "Registered Date", render: (row) => date(row.registeredDate), filterValue: (row) => date(row.registeredDate) },
      { key: "status", label: "Status", render: (row) => row.status, filterValue: (row) => row.status },
      { key: "reason", label: "Reason", render: (row) => row.reason || "—", filterValue: (row) => row.reason },
      {
        key: "edit",
        label: "Edit",
        filterable: false,
        render: (row) => (
          <button
            className="rounded-md bg-stone-100 px-2 py-1 text-kenko-green"
            onClick={() => {
              setErrors({});
              setEditing({
                id: row.id,
                assetId: row.asset.id,
                receiverEmployeeCode: row.receiver.permanentId,
                effectiveDate: row.effectiveDate.slice(0, 10),
                registeredDate: row.registeredDate.slice(0, 10),
                reason: row.reason ?? "",
              });
            }}
          >
            Edit
          </button>
        ),
      },
    ],
    [],
  );

  function setField(key: string, value: string) {
    setEditing((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => (current[key] ? { ...current, [key]: "" } : current));
  }

  async function save() {
    if (!editing) return;
    const missing = requiredErrors(editing, REQUIRED, LABELS);
    if (Object.keys(missing).length) {
      setErrors(missing);
      toast.error(`Fill in the required fields before saving: ${describeMissing(missing, LABELS)}.`, { title: "Transfer not saved" });
      return;
    }
    setSaving(true);
    try {
      await requestJson(editing.id ? `/api/transfers/${editing.id}` : "/api/transfers", jsonBody(editing.id ? "PATCH" : "POST", editing));
      setEditing(null);
      setErrors({});
      toast.success(editing.id ? "Transfer updated and current ownership reconciled." : "Asset transferred and ownership updated.", { title: "Saved" });
      await load();
    } catch (error) {
      setErrors(fieldErrorMap(error));
      toast.fromError(error, "Transfer not saved");
    } finally {
      setSaving(false);
    }
  }

  const selectedAsset = assets.find((asset) => asset.id === editing?.assetId);
  const currentOwner = selectedAsset?.assignments?.[0]?.employee;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Asset Transfers</h2>
          <p className="text-sm text-stone-500">Move registered assets by Employee ID with effective and registered dates.</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            setErrors({});
            setEditing(emptyForm());
          }}
        >
          + Transfer asset
        </button>
      </div>
      <div className="card overflow-hidden p-0">
        <FilterableTable rows={rows} columns={columns} emptyMessage="No transfers recorded." />
      </div>
      {editing && (
        <Modal
          title={editing.id ? "Edit transfer" : "Transfer asset"}
          size="max-w-2xl"
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary disabled:opacity-60" disabled={saving} onClick={save}>
                {saving ? "Saving…" : editing.id ? "Save changes" : "Transfer asset"}
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
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Asset Register item" required error={errors.assetId} className="sm:col-span-2">
                <select disabled={Boolean(editing.id)} className={inputClass(Boolean(errors.assetId), "disabled:bg-stone-100")} value={editing.assetId} onChange={(event) => setField("assetId", event.target.value)}>
                  <option value="">Select an asset</option>
                  {assets.map((asset) => <option value={asset.id} key={asset.id}>{asset.faId} · {asset.description}</option>)}
                </select>
              </Field>
              <div className="rounded-lg bg-stone-50 p-3 text-sm sm:col-span-2">
                <span className="text-stone-500">Current owner: </span>
                {currentOwner ? `${currentOwner.permanentId} · ${currentOwner.name}` : "Unassigned"}
              </div>
              <Field label="Receiving Employee ID" required error={errors.receiverEmployeeCode} className="sm:col-span-2">
                <select className={inputClass(Boolean(errors.receiverEmployeeCode))} value={editing.receiverEmployeeCode} onChange={(event) => setField("receiverEmployeeCode", event.target.value)}>
                  <option value="">Select employee</option>
                  {employees.map((employee) => <option value={employee.permanentId} key={employee.id}>{employee.permanentId} · {employee.name}</option>)}
                </select>
              </Field>
              <Field label="Effective date" error={errors.effectiveDate}>
                <input className={inputClass(Boolean(errors.effectiveDate))} type="date" value={editing.effectiveDate} onChange={(event) => setField("effectiveDate", event.target.value)} />
              </Field>
              <Field label="Registered date" error={errors.registeredDate}>
                <input className={inputClass(Boolean(errors.registeredDate))} type="date" value={editing.registeredDate} onChange={(event) => setField("registeredDate", event.target.value)} />
              </Field>
              <Field label="Reason / notes" error={errors.reason} className="sm:col-span-2">
                <textarea className={inputClass(Boolean(errors.reason))} rows={3} value={editing.reason} onChange={(event) => setField("reason", event.target.value)} />
              </Field>
            </div>
            <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
          </form>
        </Modal>
      )}
    </>
  );
}
