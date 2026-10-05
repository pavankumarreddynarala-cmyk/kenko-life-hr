"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FilterableTable, TableColumn } from "@/components/filterable-table";
import { ConfirmDialog, Field, inputClass, Modal } from "@/components/form";
import { useSessionUser } from "@/components/session-context";
import { useToast } from "@/components/toast";
import { fieldErrorMap, requestJson } from "@/lib/client-api";

type Master = { id: string; name: string; code: string };
type Sop = {
  id: string; title: string; description: string | null; fileName: string; sizeBytes: number; version: number;
  audience: "ALL" | "TAGGED"; departmentIds: string[]; roleIds: string[]; uploadedByEmail: string | null; updatedAt: string;
};
type Draft = { id?: string; title: string; description: string; audience: "ALL" | "TAGGED"; departmentIds: string[]; roleIds: string[]; file: File | null };

const blank: Draft = { title: "", description: "", audience: "TAGGED", departmentIds: [], roleIds: [], file: null };
const size = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export default function SopsPage() {
  const user = useSessionUser();
  const toast = useToast();
  const canManage = user.permissions.manageDocuments;
  const [rows, setRows] = useState<Sop[]>([]);
  const [departments, setDepartments] = useState<Master[]>([]);
  const [roles, setRoles] = useState<Master[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Sop | null>(null);

  const load = useCallback(async () => {
    try {
      const [sops, masters] = await Promise.all([
        requestJson<{ data: Sop[] }>("/api/sops", { cache: "no-store" }),
        requestJson<{ data: Record<string, Master[]> }>("/api/masters", { cache: "no-store" }),
      ]);
      setRows(sops.data ?? []);
      setDepartments(masters.data.department ?? []);
      setRoles(masters.data.employeeRole ?? []);
    } catch (error) {
      toast.fromError(error, "SOPs could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => void load(), [load]);

  const names = useCallback((ids: string[], list: Master[]) => ids.map((id) => list.find((m) => m.id === id)?.name ?? "(removed)"), []);

  async function save() {
    if (!draft) return;
    const found: Record<string, string> = {};
    if (draft.title.trim().length < 2) found.title = "Enter a title (at least 2 characters).";
    if (!draft.id && !draft.file) found.file = "Choose the document to upload.";
    if (draft.audience === "TAGGED" && draft.departmentIds.length + draft.roleIds.length === 0) found.departmentIds = "Pick at least one division or role, or choose “All employees”.";
    if (Object.keys(found).length) {
      setErrors(found);
      toast.error("Fix the highlighted fields before saving.", { title: "SOP not saved" });
      return;
    }
    const form = new FormData();
    form.set("title", draft.title);
    form.set("description", draft.description);
    form.set("audience", draft.audience);
    form.set("departmentIds", JSON.stringify(draft.audience === "ALL" ? [] : draft.departmentIds));
    form.set("roleIds", JSON.stringify(draft.audience === "ALL" ? [] : draft.roleIds));
    if (draft.file) form.set("file", draft.file);
    setBusy(true);
    try {
      await requestJson(draft.id ? `/api/sops/${draft.id}` : "/api/sops", { method: draft.id ? "PATCH" : "POST", body: form });
      toast.success(draft.id ? "SOP updated." : "SOP uploaded.", { title: "Saved" });
      setDraft(null);
      setErrors({});
      await load();
    } catch (error) {
      setErrors(fieldErrorMap(error));
      toast.fromError(error, "SOP not saved");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await requestJson(`/api/sops/${deleting.id}`, { method: "DELETE" });
      toast.success("SOP deleted.", { title: "Deleted" });
      setDeleting(null);
      await load();
    } catch (error) {
      toast.fromError(error, "SOP not deleted");
    } finally {
      setBusy(false);
    }
  }

  function toggle(list: "departmentIds" | "roleIds", id: string) {
    setDraft((d) => (d ? { ...d, [list]: d[list].includes(id) ? d[list].filter((x) => x !== id) : [...d[list], id] } : d));
    setErrors((e) => ({ ...e, departmentIds: "" }));
  }

  const columns = useMemo<TableColumn<Sop>[]>(
    () => [
      { key: "title", label: "Title", render: (s) => (<div><p className="font-medium">{s.title}</p>{s.description && <p className="max-w-md text-xs text-stone-500">{s.description}</p>}</div>), filterValue: (s) => `${s.title} ${s.description}` },
      { key: "file", label: "File", render: (s) => `${s.fileName} (${size(s.sizeBytes)})`, filterValue: (s) => s.fileName },
      { key: "version", label: "Version", render: (s) => `v${s.version}`, filterable: false },
      {
        key: "applies",
        label: "Applies to",
        render: (s) => s.audience === "ALL" ? "All employees" : [...names(s.departmentIds, departments).map((n) => `Division: ${n}`), ...names(s.roleIds, roles).map((n) => `Role: ${n}`)].join(" · "),
        filterValue: (s) => (s.audience === "ALL" ? "all employees" : [...names(s.departmentIds, departments), ...names(s.roleIds, roles)].join(" ")),
      },
      { key: "updated", label: "Updated", render: (s) => new Date(s.updatedAt).toLocaleDateString("en-IN"), filterable: false },
      {
        key: "actions",
        label: "Actions",
        filterable: false,
        render: (s) => (
          <div className="flex gap-2 whitespace-nowrap">
            { }
            <a className="rounded-md bg-stone-100 px-2 py-1" href={`/api/sops/${s.id}/file`}>Download</a>
            {canManage && (
              <>
                <button className="rounded-md bg-stone-100 px-2 py-1" onClick={() => { setErrors({}); setDraft({ id: s.id, title: s.title, description: s.description ?? "", audience: s.audience, departmentIds: s.departmentIds, roleIds: s.roleIds, file: null }); }}>Edit / replace</button>
                <button className="rounded-md bg-red-50 px-2 py-1 text-red-700" onClick={() => setDeleting(s)}>Delete</button>
              </>
            )}
          </div>
        ),
      },
    ],
    [canManage, departments, roles, names],
  );

  return (
    <>
      <div className="mb-4">
        <h2 className="text-2xl font-bold">SOPs & Standard Documents</h2>
        <p className="text-sm text-stone-500">Upload documents and choose which divisions or roles can see them in their own login.</p>
      </div>
      {canManage ? (
        <div className="mb-6"><button className="btn-primary" onClick={() => { setErrors({}); setDraft({ ...blank }); }}>+ Upload document</button></div>
      ) : (
        <p className="mb-4 text-xs text-stone-500">You can view and download documents. Only an Admin, CEO, COO or HR can upload or change them.</p>
      )}
      <div className="card overflow-hidden p-0">
        <FilterableTable rows={rows} columns={columns} loading={loading} emptyMessage="No documents uploaded yet." />
      </div>

      {draft && (
        <Modal
          title={draft.id ? "Edit document" : "Upload document"}
          subtitle="PDF, Word, Excel, PowerPoint, text or image · up to 4 MB"
          size="max-w-2xl"
          onClose={() => setDraft(null)}
          footer={
            <>
              <button className="btn border border-stone-300 bg-white" onClick={() => setDraft(null)}>Cancel</button>
              <button className="btn-primary disabled:opacity-60" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</button>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Title" required error={errors.title}>
              <input className={inputClass(Boolean(errors.title))} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
            <Field label="Description (optional)">
              <textarea className={inputClass()} rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Field>
            <Field label={draft.id ? "Replace file (optional)" : "File"} required={!draft.id} error={errors.file} hint={draft.id ? "Leave empty to keep the current file. A new file raises the version number." : undefined}>
              <input className={inputClass(Boolean(errors.file))} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg" onChange={(e) => setDraft({ ...draft, file: e.target.files?.[0] ?? null })} />
            </Field>
            <fieldset className="rounded-xl border border-stone-200 p-3">
              <legend className="px-2 text-sm font-semibold">Who can see it</legend>
              <label className="mr-5 inline-flex items-center gap-2 text-sm"><input type="radio" checked={draft.audience === "TAGGED"} onChange={() => setDraft({ ...draft, audience: "TAGGED" })} /> Selected divisions / roles</label>
              <label className="inline-flex items-center gap-2 text-sm"><input type="radio" checked={draft.audience === "ALL"} onChange={() => setDraft({ ...draft, audience: "ALL" })} /> All employees</label>
              {draft.audience === "TAGGED" && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase text-stone-500">Divisions (departments)</p>
                    <div className="mt-1 max-h-44 space-y-1 overflow-y-auto">
                      {departments.length === 0 && <p className="text-xs text-stone-500">None in Master Data yet.</p>}
                      {departments.map((m) => <label key={m.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.departmentIds.includes(m.id)} onChange={() => toggle("departmentIds", m.id)} />{m.name}</label>)}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-stone-500">Roles</p>
                    <div className="mt-1 max-h-44 space-y-1 overflow-y-auto">
                      {roles.length === 0 && <p className="text-xs text-stone-500">None in Master Data yet.</p>}
                      {roles.map((m) => <label key={m.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.roleIds.includes(m.id)} onChange={() => toggle("roleIds", m.id)} />{m.name}</label>)}
                    </div>
                  </div>
                </div>
              )}
              {errors.departmentIds && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{errors.departmentIds}</p>}
              <p className="mt-3 text-xs text-stone-500">An employee sees the document if it is tagged to their division or to their role.</p>
            </fieldset>
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog title="Delete this document?" confirmLabel="Delete" busyLabel="Deleting…" busy={busy} onConfirm={() => void remove()} onCancel={() => setDeleting(null)}>
          “{deleting.title}” will be removed for everyone. This cannot be undone.
        </ConfirmDialog>
      )}
    </>
  );
}
