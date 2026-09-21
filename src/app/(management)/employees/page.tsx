"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FilterableTable, TableColumn } from "@/components/filterable-table";
import { ConfirmDialog, Field, inputClass, Modal, RequiredLegend } from "@/components/form";
import { DeletionDetails } from "@/components/deletion-history";
import { useSessionUser } from "@/components/session-context";
import { useToast } from "@/components/toast";
import { fieldErrorMap, jsonBody, requestJson } from "@/lib/client-api";
import { describeMissing, requiredErrors, type FormErrors } from "@/lib/form-validation";
import { FIELD_LABELS } from "@/lib/field-labels";
import { INDIAN_STATES_AND_UTS } from "@/lib/validators";

type MasterItem = { id: string; name: string; code: string };
type MasterData = Record<string, MasterItem[]>;
type Employee = Record<string, unknown> & {
  id: string;
  permanentId: string;
  dynamicId?: string;
  teamOfficeCode?: string;
  name: string;
  phone: string;
  deletedAt?: string | null;
  deletedByEmail?: string | null;
  deleteReason?: string | null;
  company?: MasterItem;
  location?: MasterItem;
  city?: MasterItem;
  branch?: MasterItem;
  outletModel?: MasterItem;
  specialBranchCode?: MasterItem;
  department?: MasterItem;
  employeeRole?: MasterItem;
  designation?: MasterItem;
  costCentre?: MasterItem;
};

const masterFields = [
  ["companyId", "Company", "company"],
  ["locationId", "Location", "location"],
  ["cityId", "City", "city"],
  ["branchId", "Branch", "branch"],
  ["outletModelId", "Outlet model", "outletModel"],
  ["specialBranchCodeId", "Special / area code", "specialBranchCode"],
  ["departmentId", "Department", "department"],
  ["employeeRoleId", "Employee role", "employeeRole"],
  ["designationId", "Designation", "designation"],
  ["costCentreId", "Cost centre", "costCentre"],
] as const;

const textFields = [
  ["teamOfficeCode", "Team Office Code", "The code used by the punching (attendance) system."],
  ["name", "Name as per PAN card", ""],
  ["phone", "Mobile number", ""],
  ["email", "Work email", ""],
  ["personalEmail", "Personal email", ""],
  ["fatherName", "Father name", ""],
  ["address1", "Address line 1", ""],
  ["address2", "Address line 2", ""],
  ["pinCode", "PIN code", ""],
  ["pan", "PAN number", ""],
  ["aadhaar", "Aadhaar number", ""],
  ["bankHolderName", "Bank holder name", ""],
  ["bankName", "Bank name", ""],
  ["accountNumber", "Account number", ""],
  ["ifscCode", "IFSC code", ""],
  ["pfAccountNumber", "PF account number", ""],
  ["uanNumber", "UAN number", ""],
  ["esicNumber", "ESIC number", ""],
] as const;

// Fields the form refuses to submit without (the server enforces the same list).
const REQUIRED = ["name", "phone"] as const;
const LABELS: Record<string, string> = {
  ...FIELD_LABELS,
  ...Object.fromEntries(textFields.map(([key, label]) => [key, label])),
  permanentId: "Employee Code",
};

function date(value: unknown) {
  return value ? new Date(String(value)).toLocaleDateString("en-IN") : "—";
}

function format(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function stamp(value: unknown) {
  return value ? new Date(String(value)).toLocaleString("en-IN") : "—";
}

export default function EmployeesPage() {
  return (
    <Suspense fallback={null}>
      <EmployeesPageInner />
    </Suspense>
  );
}

function EmployeesPageInner() {
  const user = useSessionUser();
  const toast = useToast();
  const [rows, setRows] = useState<Employee[]>([]);
  const [masters, setMasters] = useState<MasterData>({});
  const [editing, setEditing] = useState<Partial<Employee> | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [deleting, setDeleting] = useState<Employee | null>(null);
  const [inspecting, setInspecting] = useState<Employee | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const canEditCode = user.permissions.editEmployeeCode;

  const load = useCallback(
    async (deletedView: boolean) => {
      try {
        const [employees, masterValues] = await Promise.all([
          requestJson<{ data: Employee[] }>(`/api/employees${deletedView ? "?deleted=1" : ""}`, { cache: "no-store" }),
          requestJson<{ data: MasterData }>("/api/masters", { cache: "no-store" }),
        ]);
        setRows(employees.data ?? []);
        setMasters(masterValues.data ?? {});
      } catch (error) {
        toast.fromError(error, "Employees could not be loaded");
      }
    },
    [toast],
  );

  const searchParams = useSearchParams();

  useEffect(() => {
    void load(showDeleted);
  }, [load, showDeleted]);

  useEffect(() => {
    if (searchParams.get("new") === "1") setEditing({ pfEligible: false, status: "ACTIVE" });
  }, [searchParams]);

  function openEditor(next: Partial<Employee> | null) {
    setErrors({});
    setEditing(next);
  }

  async function confirmDelete(reason: string) {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await requestJson(`/api/employees/${deleting.id}`, jsonBody("DELETE", { reason }));
      toast.success(
        `${deleting.name} (${deleting.permanentId}) was deleted. The record is kept in the deletion history and can be restored from “Show deleted employees”.`,
        { title: "Employee deleted" },
      );
      setDeleting(null);
      await load(showDeleted);
    } catch (error) {
      toast.fromError(error, "Employee not deleted");
    } finally {
      setBusyId(null);
    }
  }

  const restore = useCallback(
    async (row: Employee) => {
      setBusyId(row.id);
      try {
        await requestJson(`/api/employees/${row.id}/restore`, { method: "POST" });
        toast.success(`${row.name} (${row.permanentId}) is back in the Employee Master.`, { title: "Employee restored" });
        await load(showDeleted);
      } catch (error) {
        toast.fromError(error, "Employee not restored");
      } finally {
        setBusyId(null);
      }
    },
    [load, showDeleted, toast],
  );

  const columns = useMemo<TableColumn<Employee>[]>(() => {
    const base: TableColumn<Employee>[] = [
      {
        key: "edit",
        label: showDeleted ? "Actions" : "Edit",
        filterable: false,
        render: (row) =>
          showDeleted ? (
            <div className="flex gap-1">
              <button className="rounded-md bg-stone-100 px-2 py-1 text-kenko-green" onClick={() => setInspecting(row)}>
                Details
              </button>
              <button
                className="rounded-md bg-kenko-green/10 px-2 py-1 text-kenko-green disabled:opacity-50"
                disabled={busyId === row.id}
                onClick={() => restore(row)}
              >
                {busyId === row.id ? "Restoring…" : "Restore"}
              </button>
            </div>
          ) : (
            <div className="flex gap-1">
              <button
                className="rounded-md bg-stone-100 px-2 py-1 text-kenko-green"
                onClick={() =>
                  openEditor({
                    ...row,
                    joiningDate: row.joiningDate ? String(row.joiningDate).slice(0, 10) : "",
                    exitDate: row.exitDate ? String(row.exitDate).slice(0, 10) : "",
                    dateOfBirth: row.dateOfBirth ? String(row.dateOfBirth).slice(0, 10) : "",
                  })
                }
              >
                Edit
              </button>
              <button className="rounded-md bg-red-50 px-2 py-1 text-red-700" onClick={() => setDeleting(row)}>
                Delete
              </button>
            </div>
          ),
      },
      { key: "row", label: "S.No", render: (_, index) => index + 1, filterValue: (_, index) => index + 1 },
      { key: "employeeCode", label: "Employee Code", render: (row) => row.permanentId, filterValue: (row) => row.permanentId },
      { key: "teamOfficeCode", label: "Team Office Code", render: (row) => format(row.teamOfficeCode), filterValue: (row) => row.teamOfficeCode },
      { key: "organisationCode", label: "Organisation Code", render: (row) => format(row.dynamicId), filterValue: (row) => row.dynamicId },
      { key: "name", label: "Name as per PAN", render: (row) => row.name, filterValue: (row) => row.name },
      { key: "phone", label: "Mobile", render: (row) => row.phone, filterValue: (row) => row.phone },
      { key: "city", label: "City", render: (row) => format(row.city?.name), filterValue: (row) => `${row.city?.name} ${row.city?.code}` },
      { key: "outletModel", label: "Outlet Model", render: (row) => format(row.outletModel?.name), filterValue: (row) => `${row.outletModel?.name} ${row.outletModel?.code}` },
      { key: "specialCode", label: "Special / Area Code", render: (row) => format(row.specialBranchCode?.code), filterValue: (row) => `${row.specialBranchCode?.name} ${row.specialBranchCode?.code}` },
      { key: "outletCount", label: "No. of Outlets", render: (row) => format(row.numberOfOutlets), filterValue: (row) => row.numberOfOutlets },
      { key: "departmentCode", label: "Department Code", render: (row) => format(row.department?.code), filterValue: (row) => `${row.department?.name} ${row.department?.code}` },
      { key: "roleCode", label: "Employee Role Code", render: (row) => format(row.employeeRole?.code), filterValue: (row) => `${row.employeeRole?.name} ${row.employeeRole?.code}` },
      { key: "company", label: "Company", render: (row) => format(row.company?.name), filterValue: (row) => row.company?.name },
      { key: "location", label: "Location", render: (row) => format(row.location?.name), filterValue: (row) => row.location?.name },
      { key: "branch", label: "Branch", render: (row) => format(row.branch?.name), filterValue: (row) => row.branch?.name },
      { key: "department", label: "Department", render: (row) => format(row.department?.name), filterValue: (row) => row.department?.name },
      { key: "designation", label: "Designation", render: (row) => format(row.designation?.name), filterValue: (row) => row.designation?.name },
      { key: "joiningDate", label: "Joining Date", render: (row) => date(row.joiningDate), filterValue: (row) => date(row.joiningDate) },
      { key: "exitDate", label: "Last Working Day", render: (row) => date(row.exitDate), filterValue: (row) => date(row.exitDate) },
      { key: "gender", label: "Gender", render: (row) => format(row.gender), filterValue: (row) => row.gender },
      { key: "email", label: "Email", render: (row) => format(row.personalEmail || row.email), filterValue: (row) => `${row.personalEmail} ${row.email}` },
      { key: "dob", label: "Date of Birth", render: (row) => date(row.dateOfBirth), filterValue: (row) => date(row.dateOfBirth) },
      { key: "pan", label: "PAN", render: (row) => format(row.pan), filterValue: (row) => row.pan },
      { key: "aadhaar", label: "Aadhaar", render: (row) => format(row.aadhaar), filterValue: (row) => row.aadhaar },
      { key: "state", label: "State", render: (row) => format(row.state), filterValue: (row) => row.state },
      { key: "status", label: "Status", render: (row) => format(row.status), filterValue: (row) => row.status },
    ];
    if (!showDeleted) return base;
    return [
      ...base,
      { key: "deletedAt", label: "Deleted On", render: (row) => stamp(row.deletedAt), filterValue: (row) => stamp(row.deletedAt) },
      { key: "deletedBy", label: "Deleted By", render: (row) => format(row.deletedByEmail), filterValue: (row) => row.deletedByEmail },
      { key: "deleteReason", label: "Reason for Deletion", render: (row) => format(row.deleteReason), filterValue: (row) => row.deleteReason },
    ];
  }, [showDeleted, busyId, restore]);

  async function save() {
    if (!editing) return;
    const missing = requiredErrors(editing, REQUIRED, LABELS);
    if (Object.keys(missing).length) {
      setErrors(missing);
      toast.error(`Fill in the required fields before saving: ${describeMissing(missing, LABELS)}.`, {
        title: "Employee not saved",
      });
      return;
    }
    setSaving(true);
    try {
      await requestJson(editing.id ? `/api/employees/${editing.id}` : "/api/employees", jsonBody(editing.id ? "PATCH" : "POST", editing));
      setEditing(null);
      setErrors({});
      toast.success(
        editing.id ? "Employee updated. The Organisation Code was recalculated." : "Employee added to the master. An Employee Code was generated automatically.",
        { title: "Saved" },
      );
      await load(showDeleted);
    } catch (error) {
      setErrors(fieldErrorMap(error));
      toast.fromError(error, "Employee not saved");
    } finally {
      setSaving(false);
    }
  }

  function setField(key: string, value: unknown) {
    setEditing((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: "" } : current));
  }

  const isRequired = (key: string) => (REQUIRED as readonly string[]).includes(key);

  return (
    <>
      <div className="mb-4">
        <h2 className="text-2xl font-bold">Employee Master</h2>
        <p className="text-sm text-stone-500">Controlled employee records with a dynamic Organisation Code and the punching-system Team Office Code.</p>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={() => openEditor({ pfEligible: false, status: "ACTIVE" })} disabled={showDeleted}>
          + Add employee
        </button>
        <a href="/api/export?type=employees" className="btn-green">
          Export Excel
        </a>
        <label className="flex items-center gap-2 text-sm text-stone-600 sm:ml-2">
          <input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} />
          Show deleted employees (deletion history)
        </label>
      </div>
      <div className="card overflow-hidden p-0">
        <FilterableTable rows={rows} columns={columns} emptyMessage={showDeleted ? "No deleted employees." : "No employees found."} />
      </div>

      {deleting && (
        <ConfirmDialog
          title="Delete employee?"
          confirmLabel="Delete employee"
          busyLabel="Deleting…"
          busy={busyId === deleting.id}
          reasonLabel="Reason for deletion"
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        >
          You are about to delete <strong>{deleting.name}</strong> ({deleting.permanentId}). The record is not erased: it moves to the
          deletion history with your name, the time and the reason below, and it can be restored from &ldquo;Show deleted employees&rdquo;.
        </ConfirmDialog>
      )}

      {inspecting && (
        <DeletionDetails
          title={`${inspecting.permanentId} · ${inspecting.name}`}
          recordType="Employee"
          recordId={inspecting.id}
          deletedAt={inspecting.deletedAt}
          deletedBy={inspecting.deletedByEmail}
          reason={inspecting.deleteReason}
          onClose={() => setInspecting(null)}
          details={[
            ["Employee Code", inspecting.permanentId],
            ["Team Office Code", format(inspecting.teamOfficeCode)],
            ["Organisation Code", format(inspecting.dynamicId)],
            ["Name as per PAN", inspecting.name],
            ["Mobile", inspecting.phone],
            ["Email", format(inspecting.personalEmail || inspecting.email)],
            ["Date of birth", date(inspecting.dateOfBirth)],
            ["PAN", format(inspecting.pan)],
            ["Aadhaar", format(inspecting.aadhaar)],
            ["City", format(inspecting.city?.name)],
            ["Department", format(inspecting.department?.name)],
            ["Designation", format(inspecting.designation?.name)],
            ["Joining date", date(inspecting.joiningDate)],
            ["Last working day", date(inspecting.exitDate)],
            ["Status", format(inspecting.status)],
          ]}
        />
      )}

      {editing && (
        <Modal
          title={editing.id ? "Edit employee" : "Add employee"}
          subtitle={editing.id ? `${editing.permanentId} · ${editing.dynamicId || "Organisation Code pending master fields"}` : undefined}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary disabled:opacity-60" disabled={saving} onClick={save}>
                {saving ? "Saving…" : "Save employee"}
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
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {editing.id ? (
                <Field
                  label="Employee Code"
                  required
                  error={errors.permanentId}
                  hint={canEditCode ? "Generated automatically. Change it only if required — it must be unique." : "Generated automatically. Only an Admin, CEO or COO can change it."}
                >
                  <input
                    className={inputClass(Boolean(errors.permanentId), "disabled:bg-stone-100 disabled:text-stone-600")}
                    disabled={!canEditCode}
                    value={String(editing.permanentId ?? "")}
                    onChange={(event) => setField("permanentId", event.target.value.toUpperCase())}
                  />
                </Field>
              ) : (
                <div className="text-sm">
                  Employee Code
                  <div className="input mt-1 flex items-center bg-stone-50 text-stone-600">Generated automatically when saved</div>
                </div>
              )}
              {textFields.map(([key, label, hint]) => (
                <Field key={key} label={label} required={isRequired(key)} error={errors[key]} hint={hint || undefined}>
                  <input className={inputClass(Boolean(errors[key]))} value={String(editing[key] ?? "")} onChange={(event) => setField(key, event.target.value)} />
                </Field>
              ))}
              {masterFields.map(([key, label, masterKey]) => (
                <Field key={key} label={label} error={errors[key]}>
                  <select className={inputClass(Boolean(errors[key]))} value={String(editing[key] ?? "")} onChange={(event) => setField(key, event.target.value)}>
                    <option value="">Select {label.toLowerCase()}</option>
                    {(masters[masterKey] ?? []).map((item) => (
                      <option value={item.id} key={item.id}>{item.code} · {item.name}</option>
                    ))}
                  </select>
                </Field>
              ))}
              <Field label="No. of outlets" error={errors.numberOfOutlets}>
                <input className={inputClass(Boolean(errors.numberOfOutlets))} min={1} type="number" value={String(editing.numberOfOutlets ?? "")} onChange={(event) => setField("numberOfOutlets", event.target.value)} />
              </Field>
              {[
                ["joiningDate", "Date of joining"],
                ["exitDate", "Last day of working"],
                ["dateOfBirth", "Date of birth"],
              ].map(([key, label]) => (
                <Field key={key} label={label} error={errors[key]}>
                  <input className={inputClass(Boolean(errors[key]))} type="date" value={String(editing[key] ?? "")} onChange={(event) => setField(key, event.target.value)} />
                </Field>
              ))}
              <Field label="Gender" error={errors.gender}>
                <select className={inputClass(Boolean(errors.gender))} value={String(editing.gender ?? "")} onChange={(event) => setField("gender", event.target.value)}>
                  <option value="">Select gender</option>
                  <option value="FEMALE">Female</option>
                  <option value="MALE">Male</option>
                  <option value="NON_BINARY">Non-binary</option>
                  <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
                </select>
              </Field>
              <Field label="State / UT" error={errors.state}>
                <select className={inputClass(Boolean(errors.state))} value={String(editing.state ?? "")} onChange={(event) => setField("state", event.target.value)}>
                  <option value="">Select state or UT</option>
                  {INDIAN_STATES_AND_UTS.map((state) => <option key={state}>{state}</option>)}
                </select>
              </Field>
              <Field label="Employment status" error={errors.status}>
                <select className={inputClass(Boolean(errors.status))} value={String(editing.status ?? "ACTIVE")} onChange={(event) => setField("status", event.target.value)}>
                  <option value="ACTIVE">Active</option>
                  <option value="ON_LEAVE">On leave</option>
                  <option value="EXITED">Exited</option>
                </select>
              </Field>
              <Field label="PF eligible">
                <select className={inputClass()} value={editing.pfEligible ? "yes" : "no"} onChange={(event) => setField("pfEligible", event.target.value === "yes")}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </Field>
            </div>
            <p className="mt-4 rounded-lg bg-green-50 p-3 text-xs text-green-900">
              Organisation Code is derived automatically as City-Outlet Model-Special/Area-No. of Outlets-Department-Role-Employee number once all of those
              fields are filled in, and it updates whenever any of them (or the Employee Code) changes. Team Office Code is the separate punching-system code.
            </p>
            <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
          </form>
        </Modal>
      )}
    </>
  );
}
