"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilterableTable, TableColumn } from "@/components/filterable-table";
import { ConfirmDialog, Field, inputClass, Modal, RequiredLegend } from "@/components/form";
import { useSessionUser } from "@/components/session-context";
import { useToast } from "@/components/toast";
import { fieldErrorMap, jsonBody, requestJson } from "@/lib/client-api";
import { describeMissing, requiredErrors, type FormErrors } from "@/lib/form-validation";

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
type Row = { id: string; name: string; code: string; usage?: string };
type CustomMasterType = { id: string; name: string; code: string; values: Row[] };

// Selection is either a built-in typed master (key from builtinMasters) or a custom
// master type (by id, from the generic "+ Add Master" system).
type Selection = { kind: "builtin"; key: BuiltinMaster } | { kind: "custom"; id: string };

// What is being edited/deleted: an entry inside the current master, or (for custom
// masters) the master category itself.
type Target = { scope: "entry" | "type"; row: Row };

const LABELS = { name: "Name", code: "Code" };

export default function MastersPage() {
  const user = useSessionUser();
  const toast = useToast();
  const { editMasterData: canEdit, deleteMasterData: canDelete } = user.permissions;
  const [active, setActive] = useState<Selection>({ kind: "builtin", key: "location" });
  const [rows, setRows] = useState<Row[]>([]);
  const [customTypes, setCustomTypes] = useState<CustomMasterType[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [addErrors, setAddErrors] = useState<FormErrors>({});
  const [open, setOpen] = useState(false);
  const [addingMaster, setAddingMaster] = useState(false);
  const [newMasterName, setNewMasterName] = useState("");
  const [newMasterCode, setNewMasterCode] = useState("");
  const [masterErrors, setMasterErrors] = useState<FormErrors>({});
  const [editing, setEditing] = useState<(Target & { name: string; code: string }) | null>(null);
  const [editErrors, setEditErrors] = useState<FormErrors>({});
  const [deleting, setDeleting] = useState<Target | null>(null);
  const [busy, setBusy] = useState(false);
  // Only warn about a failed refresh once, not every 10 seconds while it keeps failing.
  const loadFailed = useRef(false);

  const loadCustomTypes = useCallback(async () => {
    const body = await requestJson<{ data: CustomMasterType[] }>("/api/masters/custom", { cache: "no-store" });
    setCustomTypes(body.data ?? []);
    return body.data;
  }, []);

  const load = useCallback(async () => {
    try {
      if (active.kind === "builtin") {
        const body = await requestJson<{ data: Row[] }>(`/api/masters/${active.key}`, { cache: "no-store" });
        setRows(body.data ?? []);
      } else {
        const types = await loadCustomTypes();
        setRows(types?.find((type) => type.id === active.id)?.values ?? []);
      }
      loadFailed.current = false;
    } catch (error) {
      if (!loadFailed.current) toast.fromError(error, "Master data could not be loaded");
      loadFailed.current = true;
    }
  }, [active, loadCustomTypes, toast]);

  useEffect(() => {
    loadCustomTypes().catch(() => undefined);
  }, [loadCustomTypes]);

  useEffect(() => {
    void load();
    const tick = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(tick);
  }, [load]);

  const title =
    active.kind === "builtin"
      ? builtinMasters.find(([key]) => key === active.key)?.[1] ?? ""
      : customTypes.find((type) => type.id === active.id)?.name ?? "";
  const singular = title.endsWith("ies") ? title.slice(0, -3) + "y" : title.endsWith("s") ? title.slice(0, -1) : title;
  const activeCustom = active.kind === "custom" ? customTypes.find((type) => type.id === active.id) : undefined;

  const entryUrl = (row: Row) =>
    active.kind === "builtin" ? `/api/masters/${active.key}/${row.id}` : `/api/masters/custom/${active.id}/values/${row.id}`;
  const targetUrl = (target: Target) => (target.scope === "type" && active.kind === "custom" ? `/api/masters/custom/${active.id}` : entryUrl(target.row));

  async function addValue() {
    const missing = requiredErrors({ name, code }, ["name", "code"], LABELS);
    if (Object.keys(missing).length) {
      setAddErrors(missing);
      toast.error(`Fill in the required fields before adding: ${describeMissing(missing, LABELS)}.`, { title: `${singular || "Entry"} not added` });
      return;
    }
    const url = active.kind === "builtin" ? `/api/masters/${active.key}` : `/api/masters/custom/${active.id}/values`;
    setBusy(true);
    try {
      const body = await requestJson<{ data: Row }>(url, jsonBody("POST", { name, code }));
      setName("");
      setCode("");
      setAddErrors({});
      setOpen(false);
      toast.success(`${body.data.name} was added and is now available in the dropdowns.`, { title: "Added" });
      await load();
    } catch (error) {
      setAddErrors(fieldErrorMap(error));
      toast.fromError(error, `${singular || "Entry"} not added`);
    } finally {
      setBusy(false);
    }
  }

  async function addMasterType() {
    const missing = requiredErrors({ name: newMasterName, code: newMasterCode }, ["name", "code"], LABELS);
    if (Object.keys(missing).length) {
      setMasterErrors(missing);
      toast.error(`Fill in the required fields before creating the master: ${describeMissing(missing, LABELS)}.`, { title: "Master not created" });
      return;
    }
    setBusy(true);
    try {
      const body = await requestJson<{ data: CustomMasterType }>("/api/masters/custom", jsonBody("POST", { name: newMasterName, code: newMasterCode }));
      setNewMasterName("");
      setNewMasterCode("");
      setMasterErrors({});
      setAddingMaster(false);
      toast.success(`“${body.data.name}” master created. Add its values below.`, { title: "Master created" });
      await loadCustomTypes();
      setActive({ kind: "custom", id: body.data.id });
    } catch (error) {
      setMasterErrors(fieldErrorMap(error));
      toast.fromError(error, "Master not created");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const missing = requiredErrors(editing, ["name", "code"], LABELS);
    if (Object.keys(missing).length) {
      setEditErrors(missing);
      toast.error(`Fill in the required fields before saving: ${describeMissing(missing, LABELS)}.`, { title: "Changes not saved" });
      return;
    }
    setBusy(true);
    try {
      const body = await requestJson<{ employeesRecalculated?: number }>(targetUrl(editing), jsonBody("PATCH", { name: editing.name, code: editing.code }));
      const recalculated = body.employeesRecalculated
        ? ` The Organisation Code of ${body.employeesRecalculated} employee(s) was recalculated.`
        : "";
      toast.success(`“${editing.name}” was updated everywhere it is used.${recalculated}`, { title: "Saved" });
      setEditing(null);
      setEditErrors({});
      await Promise.all([load(), loadCustomTypes()]);
    } catch (error) {
      setEditErrors(fieldErrorMap(error));
      toast.fromError(error, "Changes not saved");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await requestJson(targetUrl(deleting), { method: "DELETE" });
      toast.success(`“${deleting.row.name}” was deleted.`, { title: "Deleted" });
      const wasType = deleting.scope === "type";
      setDeleting(null);
      if (wasType) setActive({ kind: "builtin", key: "location" });
      await Promise.all([load(), loadCustomTypes()]);
    } catch (error) {
      // Includes "cannot delete: it is used by 3 employees and 2 assets".
      toast.fromError(error, "Not deleted");
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }

  const columns = useMemo<TableColumn<Row>[]>(
    () => [
      { key: "name", label: "Name", render: (row) => row.name, filterValue: (row) => row.name },
      { key: "code", label: "Code", render: (row) => row.code, filterValue: (row) => row.code },
      ...(active.kind === "builtin"
        ? [{ key: "usage", label: "In use by", render: (row: Row) => row.usage || "Not used", filterValue: (row: Row) => row.usage }]
        : []),
      {
        key: "actions",
        label: "Actions",
        filterable: false,
        render: (row) => (
          <div className="flex gap-1">
            <button
              className="rounded-md bg-stone-100 px-2 py-1 text-kenko-green disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canEdit}
              onClick={() => {
                setEditErrors({});
                setEditing({ scope: "entry", row, name: row.name, code: row.code });
              }}
            >
              Edit
            </button>
            <button
              className="rounded-md bg-red-50 px-2 py-1 text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canDelete}
              title={canDelete ? undefined : "Only an Admin, CEO or COO can delete master data"}
              onClick={() => setDeleting({ scope: "entry", row })}
            >
              Delete
            </button>
          </div>
        ),
      },
    ],
    [active.kind, canEdit, canDelete],
  );

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-widest text-kenko-green">ADMINISTRATION</p>
          <h2 className="text-2xl font-bold">Master Data</h2>
          <p className="text-sm text-stone-500">Control every organisation-backed dropdown from one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
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
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-start">
            <Field label="Master name" required error={masterErrors.name}>
              <input className={inputClass(Boolean(masterErrors.name))} value={newMasterName} onChange={(event) => { setNewMasterName(event.target.value); setMasterErrors({ ...masterErrors, name: "" }); }} placeholder="Master name" />
            </Field>
            <Field label="Unique code" required error={masterErrors.code}>
              <input className={inputClass(Boolean(masterErrors.code))} value={newMasterCode} onChange={(event) => { setNewMasterCode(event.target.value.toUpperCase()); setMasterErrors({ ...masterErrors, code: "" }); }} placeholder="Unique code" />
            </Field>
            <button className="btn-primary md:mt-6 disabled:opacity-60" disabled={busy} onClick={addMasterType}>Create master</button>
          </div>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="card h-fit space-y-4 p-2">
          <div>
            <p className="px-3 py-1 text-xs font-bold uppercase tracking-wide text-stone-400">Standard</p>
            {builtinMasters.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActive({ kind: "builtin", key })}
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
                onClick={() => setActive({ kind: "custom", id: type.id })}
                className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm ${active.kind === "custom" && active.id === type.id ? "bg-orange-50 font-semibold text-kenko-orange" : "hover:bg-stone-50"}`}
              >
                {type.name}
              </button>
            ))}
          </div>
        </aside>
        <section className="card min-w-0 overflow-hidden p-0">
          {open && (
            <div className="border-b bg-orange-50 p-4">
              <RequiredLegend />
              <div className="mt-2 grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-start">
                <Field label={`${singular} name`} required error={addErrors.name}>
                  <input className={inputClass(Boolean(addErrors.name))} value={name} onChange={(event) => { setName(event.target.value); setAddErrors({ ...addErrors, name: "" }); }} placeholder={`${singular} name`} />
                </Field>
                <Field label="Unique code" required error={addErrors.code}>
                  <input className={inputClass(Boolean(addErrors.code))} value={code} onChange={(event) => { setCode(event.target.value.toUpperCase()); setAddErrors({ ...addErrors, code: "" }); }} placeholder="Unique code" />
                </Field>
                <button className="btn-primary md:mt-6 disabled:opacity-60" disabled={busy} onClick={addValue}>Add</button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 p-4">
            <h3 className="font-bold">{title}</h3>
            <div className="flex flex-wrap items-center gap-3">
              {activeCustom && (
                <>
                  <button
                    className="text-xs text-kenko-green underline disabled:opacity-40"
                    disabled={!canEdit}
                    onClick={() => {
                      setEditErrors({});
                      setEditing({ scope: "type", row: activeCustom, name: activeCustom.name, code: activeCustom.code });
                    }}
                  >
                    Rename master
                  </button>
                  <button
                    className="text-xs text-red-700 underline disabled:opacity-40"
                    disabled={!canDelete}
                    title={canDelete ? undefined : "Only an Admin, CEO or COO can delete master data"}
                    onClick={() => setDeleting({ scope: "type", row: activeCustom })}
                  >
                    Delete master
                  </button>
                </>
              )}
              <span className="text-xs text-stone-500">Auto-refreshes every 10 seconds</span>
            </div>
          </div>
          <FilterableTable rows={rows} columns={columns} emptyMessage={`No ${title.toLowerCase()} configured.`} />
        </section>
      </div>

      {editing && (
        <Modal
          title={editing.scope === "type" ? "Rename master" : `Edit ${singular.toLowerCase()}`}
          subtitle="Changes apply everywhere this entry is already used."
          size="max-w-md"
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary disabled:opacity-60" disabled={busy} onClick={saveEdit}>{busy ? "Saving…" : "Save changes"}</button>
            </>
          }
        >
          <form
            className="space-y-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void saveEdit();
            }}
          >
            <RequiredLegend />
            <Field label="Name" required error={editErrors.name}>
              <input className={inputClass(Boolean(editErrors.name))} value={editing.name} onChange={(event) => { setEditing({ ...editing, name: event.target.value }); setEditErrors({ ...editErrors, name: "" }); }} />
            </Field>
            <Field label="Code" required error={editErrors.code} hint="Must be unique. Changing a code also updates the Organisation Code of employees that use it.">
              <input className={inputClass(Boolean(editErrors.code))} value={editing.code} onChange={(event) => { setEditing({ ...editing, code: event.target.value.toUpperCase() }); setEditErrors({ ...editErrors, code: "" }); }} />
            </Field>
            <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
          </form>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title={deleting.scope === "type" ? "Delete master?" : `Delete ${singular.toLowerCase()}?`}
          confirmLabel="Delete"
          busyLabel="Deleting…"
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
        >
          You are about to permanently delete <strong>{deleting.row.name}</strong> ({deleting.row.code}).
          {deleting.row.usage ? (
            <> It is currently used by <strong>{deleting.row.usage}</strong>, so the system will refuse until those records use something else.</>
          ) : (
            <> Nothing uses it right now. This cannot be undone.</>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
