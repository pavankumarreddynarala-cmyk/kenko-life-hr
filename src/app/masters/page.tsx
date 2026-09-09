"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { FilterableTable, TableColumn } from "@/components/filterable-table";

const masters = [
  ["company", "Companies"],
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
type Master = (typeof masters)[number][0];
type Row = { id: string; name: string; code: string };

export default function MastersPage() {
  const [active, setActive] = useState<Master>("company");
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/masters/${active}`, { cache: "no-store" });
    const body = await response.json();
    setRows(body.data ?? []);
  }, [active]);
  useEffect(() => {
    void load();
    const tick = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(tick);
  }, [load]);

  async function add() {
    const response = await fetch(`/api/masters/${active}`, {
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

  const columns = useMemo<TableColumn<Row>[]>(
    () => [
      { key: "name", label: "Name", render: (row) => row.name, filterValue: (row) => row.name },
      { key: "code", label: "Code", render: (row) => row.code, filterValue: (row) => row.code },
    ],
    [],
  );
  const title = masters.find(([key]) => key === active)?.[1] ?? "";
  const singular = title.endsWith("ies") ? title.slice(0, -3) + "y" : title.endsWith("s") ? title.slice(0, -1) : title;

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-widest text-kenko-green">ADMINISTRATION</p>
          <h2 className="text-2xl font-bold">Master Data</h2>
          <p className="text-sm text-stone-500">Control every organisation-backed dropdown from one place.</p>
        </div>
        <button className="btn-primary" onClick={() => setOpen((value) => !value)}>+ Add {singular}</button>
      </div>
      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <aside className="card h-fit p-2">
          {masters.map(([key, label]) => (
            <button key={key} onClick={() => { setActive(key); setNotice(""); }} className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm ${active === key ? "bg-orange-50 font-semibold text-kenko-orange" : "hover:bg-stone-50"}`}>
              {label}
            </button>
          ))}
        </aside>
        <section className="card overflow-hidden p-0">
          {open && (
            <div className="border-b bg-orange-50 p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
                <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder={`${singular} name`} />
                <input className="input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Unique code" />
                <button className="btn-primary" onClick={add}>Add</button>
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
