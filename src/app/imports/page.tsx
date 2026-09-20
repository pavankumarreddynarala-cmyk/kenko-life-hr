"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Shell } from "@/components/shell";
import { FilterableTable, TableColumn } from "@/components/filterable-table";

type RowError = { rowNumber: number; field?: string; message: string };
type DisplayRowError = RowError & { id: string };
type ValidateResult = { batchId: string; status: string; totalRows: number; validCount: number; errorCount: number; errors: RowError[] };
type ConfirmResult = { batchId: string; imported: number; failed: number; failures: { rowNumber: unknown; message: string }[] };
type HistoryRow = { id: string; type: string; status: string; filename: string; totalRows: number; validCount: number; errorCount: number; createdAt: string };

function ImportPanel({ type, title, templateType }: { type: "employees" | "assets"; title: string; templateType: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"validate" | "confirm" | null>(null);
  const [result, setResult] = useState<ValidateResult | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);
  const [message, setMessage] = useState("");

  async function validate() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setMessage("Choose a completed template file first.");
    setMessage("");
    setConfirmResult(null);
    setBusy("validate");
    try {
      const form = new FormData();
      form.set("type", type);
      form.set("file", file);
      const response = await fetch("/api/imports/validate", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to validate the file");
      setResult(body.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to validate the file");
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (!result) return;
    setBusy("confirm");
    setMessage("");
    try {
      const response = await fetch(`/api/imports/${result.batchId}/confirm`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to import this batch");
      setConfirmResult(body.data);
      setResult(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to import this batch");
    } finally {
      setBusy(null);
    }
  }

  const errorColumns: TableColumn<DisplayRowError>[] = [
    { key: "row", label: "Row", render: (row) => row.rowNumber, filterValue: (row) => row.rowNumber },
    { key: "field", label: "Field", render: (row) => row.field ?? "—", filterValue: (row) => row.field },
    { key: "message", label: "Issue", render: (row) => row.message, filterValue: (row) => row.message },
  ];

  return (
    <section className="card">
      <h3 className="font-bold">{title}</h3>
      <p className="mt-2 text-sm text-stone-500">Download the controlled template, complete it, then upload for validation.</p>
      <a className="btn mt-4 inline-block" href={`/api/export?type=${templateType}`}>Download template</a>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="text-sm" />
        <button className="btn-primary disabled:opacity-60" disabled={busy !== null} onClick={validate}>
          {busy === "validate" ? "Validating…" : "Validate"}
        </button>
      </div>
      {message && <p className="mt-3 rounded-lg bg-orange-50 p-3 text-sm text-orange-900">{message}</p>}
      {result && (
        <div className="mt-4 rounded-lg border border-stone-200 p-4">
          <p className="text-sm">
            <strong>{result.totalRows}</strong> rows read · <strong className="text-kenko-green">{result.validCount}</strong> ready to import ·{" "}
            <strong className={result.errorCount ? "text-red-600" : ""}>{result.errorCount}</strong> with errors
          </p>
          {result.errors.length > 0 && (
            <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border">
              <FilterableTable
                rows={result.errors.map((error, index) => ({ ...error, id: `${error.rowNumber}-${index}` }))}
                columns={errorColumns}
                emptyMessage="No errors."
              />
            </div>
          )}
          <button className="btn-primary mt-4 disabled:opacity-60" disabled={busy !== null || result.validCount === 0} onClick={confirm}>
            {busy === "confirm" ? "Importing…" : `Confirm import of ${result.validCount} row(s)`}
          </button>
        </div>
      )}
      {confirmResult && (
        <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-900">
          Imported {confirmResult.imported} row(s).{confirmResult.failed ? ` ${confirmResult.failed} row(s) failed during the final write — see Audit Logs for details.` : ""}
        </p>
      )}
    </section>
  );
}

export default function Imports() {
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/imports", { cache: "no-store" });
    const body = await response.json();
    setHistory(body.data ?? []);
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const historyColumns: TableColumn<HistoryRow>[] = [
    { key: "time", label: "Uploaded", render: (row) => new Date(row.createdAt).toLocaleString("en-IN"), filterValue: (row) => new Date(row.createdAt).toLocaleString("en-IN") },
    { key: "type", label: "Type", render: (row) => row.type, filterValue: (row) => row.type },
    { key: "filename", label: "File", render: (row) => row.filename, filterValue: (row) => row.filename },
    { key: "status", label: "Status", render: (row) => row.status, filterValue: (row) => row.status },
    { key: "totals", label: "Rows", render: (row) => `${row.validCount} valid / ${row.errorCount} error / ${row.totalRows} total`, filterValue: (row) => row.totalRows },
  ];

  return (
    <Shell>
      <h2 className="text-2xl font-bold">Import / Export</h2>
      <p className="mt-1 text-stone-500">Imports are staged, validated row-by-row, reviewed, then confirmed.</p>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <ImportPanel type="employees" title="Employee import" templateType="employee-template" />
        <ImportPanel type="assets" title="Fixed asset import" templateType="asset-template" />
      </div>
      <section className="card mt-5">
        <h3 className="font-bold">Recent imports</h3>
        <div className="mt-3 overflow-hidden rounded-lg border">
          <FilterableTable rows={history} columns={historyColumns} emptyMessage="No imports yet." />
        </div>
      </section>
    </Shell>
  );
}
