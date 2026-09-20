"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { FilterableTable, TableColumn } from "@/components/filterable-table";

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

function date(value: string) {
  return new Date(value).toLocaleDateString("en-IN");
}

export default function TransfersPage() {
  const [rows, setRows] = useState<Transfer[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Person[]>([]);
  const [editing, setEditing] = useState<(ReturnType<typeof emptyForm> & { id?: string }) | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [transferResponse, assetResponse, employeeResponse] = await Promise.all([
      fetch("/api/transfers", { cache: "no-store" }),
      fetch("/api/assets", { cache: "no-store" }),
      fetch("/api/employees", { cache: "no-store" }),
    ]);
    const [transfers, assetRows, employeeRows] = await Promise.all([
      transferResponse.json(),
      assetResponse.json(),
      employeeResponse.json(),
    ]);
    setRows(transfers.data ?? []);
    setAssets(assetRows.data ?? []);
    setEmployees(employeeRows.data ?? []);
  }, []);

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
            onClick={() =>
              setEditing({
                id: row.id,
                assetId: row.asset.id,
                receiverEmployeeCode: row.receiver.permanentId,
                effectiveDate: row.effectiveDate.slice(0, 10),
                registeredDate: row.registeredDate.slice(0, 10),
                reason: row.reason ?? "",
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
    const response = await fetch(editing.id ? `/api/transfers/${editing.id}` : "/api/transfers", {
      method: editing.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    const body = await response.json();
    if (!response.ok) return setNotice(body.error ?? "Unable to save transfer");
    setEditing(null);
    setNotice(editing.id ? "Transfer updated and current ownership reconciled." : "Asset transferred and ownership updated.");
    await load();
  }

  const selectedAsset = assets.find((asset) => asset.id === editing?.assetId);
  const currentOwner = selectedAsset?.assignments?.[0]?.employee;

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Asset Transfers</h2>
          <p className="text-sm text-stone-500">Move registered assets by Employee ID with effective and registered dates.</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing(emptyForm())}>+ Transfer asset</button>
      </div>
      <div className="card overflow-hidden p-0">
        <FilterableTable rows={rows} columns={columns} emptyMessage="No transfers recorded." />
      </div>
      {notice && <p className="mt-4 rounded-lg bg-orange-50 p-3 text-sm text-orange-900">{notice}</p>}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4">
          <section className="mx-auto mt-16 max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex justify-between">
              <h3 className="text-xl font-bold">{editing.id ? "Edit transfer" : "Transfer asset"}</h3>
              <button aria-label="Close" onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2">
                Asset Register item
                <select disabled={Boolean(editing.id)} className="input mt-1 disabled:bg-stone-100" value={editing.assetId} onChange={(event) => setEditing({ ...editing, assetId: event.target.value })}>
                  <option value="">Select an asset</option>
                  {assets.map((asset) => <option value={asset.id} key={asset.id}>{asset.faId} · {asset.description}</option>)}
                </select>
              </label>
              <div className="rounded-lg bg-stone-50 p-3 text-sm sm:col-span-2">
                <span className="text-stone-500">Current owner: </span>
                {currentOwner ? `${currentOwner.permanentId} · ${currentOwner.name}` : "Unassigned"}
              </div>
              <label className="text-sm sm:col-span-2">
                Receiving Employee ID
                <select className="input mt-1" value={editing.receiverEmployeeCode} onChange={(event) => setEditing({ ...editing, receiverEmployeeCode: event.target.value })}>
                  <option value="">Select employee</option>
                  {employees.map((employee) => <option value={employee.permanentId} key={employee.id}>{employee.permanentId} · {employee.name}</option>)}
                </select>
              </label>
              <label className="text-sm">
                Effective date
                <input className="input mt-1" type="date" value={editing.effectiveDate} onChange={(event) => setEditing({ ...editing, effectiveDate: event.target.value })} />
              </label>
              <label className="text-sm">
                Registered date
                <input className="input mt-1" type="date" value={editing.registeredDate} onChange={(event) => setEditing({ ...editing, registeredDate: event.target.value })} />
              </label>
              <label className="text-sm sm:col-span-2">
                Reason / notes
                <textarea className="input mt-1" rows={3} value={editing.reason} onChange={(event) => setEditing({ ...editing, reason: event.target.value })} />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" onClick={save}>{editing.id ? "Save changes" : "Transfer asset"}</button>
            </div>
          </section>
        </div>
      )}
    </Shell>
  );
}
