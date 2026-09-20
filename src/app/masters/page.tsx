"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { FilterableTable, TableColumn } from "@/components/filterable-table";

// Company is intentionally not listed here: it stays a real, working master under the
// hood (Employee/Asset company dropdowns still use it), but it's no longer offered from
// this admin section.
const builtinMasters = [
  ["location", "Locations"],
  ["city", "Cities"],
  ["branch", "Branches"],
  ["outletModel", "Outlet Models"],
  ["specialBranchCode", "Special / Area Codes"],
  ["department", "Departments"],
  ["employeeRole", "Employee Roles"],
  ["designation", "Designations"],
  ["costCentre", "Cost Centres"],
] as const;
type BuiltinMaster = (typeof builtinMasters)[number][0];
type Row = { id: string; name: string; code: string };
type CustomMasterType = { id: string; name: string; code: string; values: Row[] };

// Selection is either a built-in typed master (key from builtinMasters) or a custom
// master type (by id, from the generic "+ Add Master" system).
type Selection = { kind: "builtin"; key: BuiltinMaster } | { kind: "custom"; id: string };

export default function MastersPage() {
  const [active, setActive] = useState<Selection>({ kind: "builtin", key: "location" });
  const [rows, setRows] = useState<Row[]>([]);
  const [customTypes, setCustomTypes] = useState<CustomMasterType[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [addingMaster, setAddingMaster] = useState(false);
  const [newMasterName, setNewMasterName] = useState("");
  const [newMasterCode, setNewMasterCode] = useState("");

  const loadCustomTypes = useCallback(async () => {
    const response = await fetch("/api/masters/custom", { cache: "no-store" });
    const body = await response.json();
    setCustomTypes(body.data ?? []);
    return body.data as CustomMasterType[] | undefined;
  }, []);

  const load = useCallback(async () => {
    if (active.kind === "builtin") {
      const response = await fetch(`/api/masters/${active.key}`, { cache: "no-store" });
      const body = await response.json();
      setRows(body.data ?? []);
    } else {
      const types = await loadCustomTypes();
      setRows(types?.find((type) => type.id === active.id)?.values ?? []);
    }
  }, [active, loadCustomTypes]);

  useEffect(() => {
    void loadCustomTypes();
  }, [loadCustomTypes]);

  useEffect(() => {
    void load();
    const tick = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(tick);
  }, [load]);

  async function addValue() {
    const url = active.kind === "builtin" ? `/api/masters/${active.key}` : `/api/masters/custom/${active.id}/values`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, code }),
    });
    const body = await response.json();
    if (!response.ok) return setNotice(body.error ?? "Unable to add item");
    setName("");
    setCode("");
    setOpen(false);
    setNotice(`${body.data.name} added and available in governed dropdowns.`);
    await load();
  }

  async function addMasterType() {
    const response = await fetch("/api/masters/custom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newMasterName, code: newMasterCode }),
    });
    const body = await response.json();
    if (!response.ok) return setNotice(body.error ?? "Unable to create master");
    setNewMasterName("");
    setNewMasterCode("");
    setAddingMaster(false);
    setNotice(`"${body.data.name}" master created. Add its values below.`);
    await loadCustomTypes();
    setActive({ kind: "custom", id: body.data.id });
  }

  const columns = useMemo<TableColumn<Row>[]>(
    () => [
      { key: "name", label: "Name", render: (row) => row.name, filterValue: (row) => row.name },
      { key: "code", label: "Code", render: (row) => row.code, filterValue: (row) => row.code },
    ],
    [],
  );

  const title =
    active.kind === "builtin"
      ? builtinMasters.find(([key]) => key === active.key)?.[1] ?? ""
      : customTypes.find((type) => type.id === active.id)?.name ?? "";
  const singular = title.endsWith("ies") ? title.slice(0, -3) + "y" : title.endsWith("s") ? title.slice(0, -1) : title;

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-widest text-kenko-green">ADMINISTRATION</p>
          <h2 className="text-2xl font-bold">Master Data</h2>
          <p className="text-sm text-stone-500">Control every organisation-backed dropdown from one place.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setAddingMaster((value) => !value)}>+ Add Master</button>
          <button className="btn-primary" onClick={() => setOpen((value) => !value)}>+ Add {singular}</button>
        </div>
      </div>
      {addingMaster && (
        <div className="card mb-5 bg-orange-50">
          <p className="text-sm font-semibold">New master category</p>
          <p className="mt-1 text-xs text-stone-500">
            Create a brand new master (e.g. &ldquo;Shift Type&rdquo;, code &ldquo;SHIFT&rdquo;) — no code changes needed. You can
            add its values right after.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <input className="input" value={newMasterName} onChange={(event) => setNewMasterName(event.target.value)} placeholder="Master name" />
            <input className="input" value={newMasterCode} onChange={(event) => setNewMasterCode(event.target.value.toUpperCase())} placeholder="Unique code" />
            <button className="btn-primary" onClick={addMasterType}>Create master</button>
          </div>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <aside className="card h-fit space-y-4 p-2">
          <div>
            <p className="px-3 py-1 text-xs font-bold uppercase tracking-wide text-stone-400">Standard</p>
            {builtinMasters.map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setActive({ kind: "builtin", key }); setNotice(""); }}
                className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm ${active.kind === "builtin" && active.key === key ? "bg-orange-50 font-semibold text-kenko-orange" : "hover:bg-stone-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div>
            <p className="px-3 py-1 text-xs font-bold uppercase tracking-wide text-stone-400">Custom</p>
            {customTypes.length === 0 && <p className="px-3 py-1 text-xs text-stone-400">None yet — use &ldquo;+ Add Master&rdquo;.</p>}
            {customTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => { setActive({ kind: "custom", id: type.id }); setNotice(""); }}
                className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm ${active.kind === "custom" && active.id === type.id ? "bg-orange-50 font-semibold text-kenko-orange" : "hover:bg-stone-50"}`}
              >
                {type.name}
              </button>
            ))}
          </div>
        </aside>
        <section className="card overflow-hidden p-0">
          {open && (
            <div className="border-b bg-orange-50 p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
                <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder={`${singular} name`} />
                <input className="input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Unique code" />
                <button className="btn-primary" onClick={addValue}>Add</button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between p-4">
            <h3 className="font-bold">{title}</h3>
            <span className="text-xs text-stone-500">Auto-refreshes every 10 seconds</span>
          </div>
          <FilterableTable rows={rows} columns={columns} emptyMessage={`No ${title.toLowerCase()} configured.`} />
        </section>
      </div>
      {notice && <p className="mt-4 rounded-lg bg-orange-50 p-3 text-sm text-orange-900">{notice}</p>}
    </Shell>
  );
}
