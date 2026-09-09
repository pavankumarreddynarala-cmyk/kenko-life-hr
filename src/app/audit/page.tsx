"use client";

import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { FilterableTable, TableColumn } from "@/components/filterable-table";

type AuditRow = {
  id: string;
  createdAt: string;
  email?: string;
  actorId?: string;
  role?: string;
  module: string;
  recordType: string;
  recordId: string;
  action: string;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: unknown;
  reason?: string;
};

function compactJson(value: unknown) {
  if (value === null || value === undefined) return "—";
  return JSON.stringify(value);
}

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  useEffect(() => {
    void fetch("/api/audit", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => setRows(body.data ?? []));
  }, []);
  const columns = useMemo<TableColumn<AuditRow>[]>(
    () => [
      { key: "time", label: "Timestamp", render: (row) => new Date(row.createdAt).toLocaleString("en-IN"), filterValue: (row) => new Date(row.createdAt).toLocaleString("en-IN") },
      { key: "actor", label: "Actor", render: (row) => row.email || row.actorId || "System", filterValue: (row) => `${row.email} ${row.actorId}` },
      { key: "role", label: "Role", render: (row) => row.role || "—", filterValue: (row) => row.role },
      { key: "module", label: "Module", render: (row) => row.module, filterValue: (row) => row.module },
      { key: "entity", label: "Entity", render: (row) => `${row.recordType} · ${row.recordId}`, filterValue: (row) => `${row.recordType} ${row.recordId}` },
      { key: "action", label: "Action", render: (row) => row.action, filterValue: (row) => row.action },
      { key: "before", label: "Before", render: (row) => <span className="block max-w-80 truncate" title={compactJson(row.previousValue)}>{compactJson(row.previousValue)}</span>, filterValue: (row) => compactJson(row.previousValue) },
      { key: "after", label: "After / Details", render: (row) => <span className="block max-w-80 truncate" title={compactJson(row.newValue ?? row.metadata)}>{compactJson(row.newValue ?? row.metadata)}</span>, filterValue: (row) => compactJson(row.newValue ?? row.metadata) },
      { key: "reason", label: "Reason", render: (row) => row.reason || "—", filterValue: (row) => row.reason },
    ],
    [],
  );
  return (
    <Shell>
      <div className="mb-6 flex justify-between">
        <div>
          <h2 className="text-2xl font-bold">Audit Log</h2>
          <p className="text-sm text-stone-500">Append-only actor, action, entity, before/after, and timestamp history.</p>
        </div>
        <a className="btn-green" href="/api/export?type=audit">Export Excel</a>
      </div>
      <div className="card overflow-hidden p-0">
        <FilterableTable rows={rows} columns={columns} emptyMessage="No audit events recorded." />
      </div>
    </Shell>
  );
}
