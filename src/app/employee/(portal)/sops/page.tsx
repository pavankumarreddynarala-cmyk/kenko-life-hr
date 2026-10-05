"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { requestJson } from "@/lib/client-api";

type Sop = { id: string; title: string; description: string | null; fileName: string; sizeBytes: number; version: number; updatedAt: string };
const size = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export default function EmployeeSopsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Sop[] | null>(null);
  useEffect(() => {
    requestJson<{ data: Sop[] }>("/api/employee/sops", { cache: "no-store" })
      .then((body) => setRows(body.data ?? []))
      .catch((error) => { toast.fromError(error, "Your SOPs could not be loaded"); setRows([]); });
  }, [toast]);

  return (
    <>
      <div className="mb-4">
        <h2 className="text-2xl font-bold">SOPs & Documents</h2>
        <p className="text-sm text-stone-500">Documents shared with your division or role.</p>
      </div>
      {rows === null ? (
        <p className="card text-sm text-stone-600">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="card text-sm text-stone-600">No documents have been shared with you yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((s) => (
            <li key={s.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{s.title}</p>
                {s.description && <p className="text-sm text-stone-600">{s.description}</p>}
                <p className="mt-1 break-all text-xs text-stone-500">{s.fileName} · {size(s.sizeBytes)} · v{s.version} · updated {new Date(s.updatedAt).toLocaleDateString("en-IN")}</p>
              </div>
              { }
              <a className="btn-green" href={`/api/sops/${s.id}/file`}>Download</a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
