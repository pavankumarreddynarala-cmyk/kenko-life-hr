"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/form";
import { useToast } from "@/components/toast";
import { requestJson } from "@/lib/client-api";

type AuditRow = {
  id: string;
  createdAt: string;
  email?: string | null;
  actorId?: string | null;
  role?: string | null;
  action: string;
  reason?: string | null;
};

const when = (value?: string | null) => (value ? new Date(value).toLocaleString("en-IN") : "—");

/**
 * Everything the system kept about a deleted employee or asset: who deleted it, when and
 * why, the original record details exactly as they were, and the record's full audit trail.
 */
export function DeletionDetails({
  title,
  recordType,
  recordId,
  deletedAt,
  deletedBy,
  reason,
  details,
  onClose,
}: {
  title: string;
  recordType: "Employee" | "FixedAsset";
  recordId: string;
  deletedAt?: string | null;
  deletedBy?: string | null;
  reason?: string | null;
  details: [string, string][];
  onClose: () => void;
}) {
  const toast = useToast();
  const [trail, setTrail] = useState<AuditRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    requestJson<{ data: AuditRow[] }>(`/api/audit?recordType=${recordType}&recordId=${encodeURIComponent(recordId)}&limit=100`, {
      cache: "no-store",
    })
      .then((body) => {
        if (!cancelled) setTrail(body.data);
      })
      .catch((error) => {
        if (!cancelled) {
          setTrail([]);
          toast.fromError(error, "The audit trail could not be loaded");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [recordType, recordId, toast]);

  return (
    <Modal title={title} subtitle="Deletion history" onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Deleted on", when(deletedAt)],
          ["Deleted by", deletedBy || "—"],
          ["Reason", reason || "—"],
        ].map(([label, value]) => (
          <div className="rounded-xl bg-red-50 p-3" key={label}>
            <p className="text-xs font-semibold uppercase tracking-wide text-red-800">{label}</p>
            <p className="mt-1 break-words text-sm font-medium text-red-950">{value}</p>
          </div>
        ))}
      </div>

      <h4 className="mt-6 font-bold">Original record details</h4>
      <dl className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {details.map(([label, value]) => (
          <div className="rounded-xl bg-stone-50 p-3" key={label}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</dt>
            <dd className="mt-1 break-words text-sm font-medium">{value || "—"}</dd>
          </div>
        ))}
      </dl>

      <h4 className="mt-6 font-bold">Audit trail</h4>
      <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-stone-200">
        <table className="w-full min-w-[32rem]">
          <thead>
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Who</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {trail === null && (
              <tr><td className="px-3 py-4 text-center text-stone-400" colSpan={4}>Loading…</td></tr>
            )}
            {trail?.length === 0 && (
              <tr><td className="px-3 py-4 text-center text-stone-500" colSpan={4}>No audit events found for this record.</td></tr>
            )}
            {trail?.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap px-3 py-2">{when(row.createdAt)}</td>
                <td className="px-3 py-2">{row.email || row.actorId || "System"}{row.role ? ` (${row.role})` : ""}</td>
                <td className="px-3 py-2">{row.action.replace(/_/g, " ")}</td>
                <td className="px-3 py-2">{row.reason || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
