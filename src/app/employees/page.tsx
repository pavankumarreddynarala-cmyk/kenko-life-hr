"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { FilterableTable, TableColumn } from "@/components/filterable-table";
import { INDIAN_STATES_AND_UTS } from "@/lib/validators";
import { fieldError, normalizeIfsc, normalizePan } from "@/lib/field-rules";

type MasterItem = { id: string; name: string; code: string; active?: boolean };
type MasterData = Record<string, MasterItem[]>;
type Employee = Record<string, unknown> & {
  id: string;
  permanentId: string;
  dynamicId?: string;
  name: string;
  phone: string;
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
  ["teamOfficeCode", "Team / office code"],
  ["name", "Name as per PAN card"],
  ["phone", "Mobile number"],
  ["email", "Work email"],
  ["personalEmail", "Personal email"],
  ["fatherName", "Father name"],
  ["address1", "Address line 1"],
  ["address2", "Address line 2"],
  ["pinCode", "PIN code"],
  ["pan", "PAN number"],
  ["aadhaar", "Aadhaar number"],
  ["bankHolderName", "Bank holder name"],
  ["bankName", "Bank name"],
  ["accountNumber", "Account number"],
  ["ifscCode", "IFSC code"],
  ["pfAccountNumber", "PF account number"],
  ["uanNumber", "UAN number"],
  ["esicNumber", "ESIC number"],
] as const;

// Phone-friendly keyboards and instant clean-up as the user types (R5-R8, R18).
type InputRule = { inputMode?: "numeric" | "text"; maxLength?: number; clean?: (value: string) => string; validate?: "pan" | "phone" | "ifsc" | "uan" };
const digits = (value: string) => value.replace(/\D/g, "");
const inputRules: Record<string, InputRule> = {
  phone: { inputMode: "numeric", maxLength: 10, clean: digits, validate: "phone" },
  pan: { maxLength: 10, clean: (v) => normalizePan(v).replace(/[^A-Z0-9]/g, ""), validate: "pan" },
  ifscCode: { maxLength: 11, clean: (v) => normalizeIfsc(v).replace(/[^A-Z0-9]/g, ""), validate: "ifsc" },
  uanNumber: { inputMode: "numeric", maxLength: 12, clean: digits, validate: "uan" },
  aadhaar: { inputMode: "numeric", maxLength: 12, clean: digits },
  pinCode: { inputMode: "numeric", maxLength: 6, clean: digits },
};

function date(value: unknown) {
  return value ? new Date(String(value)).toLocaleDateString("en-IN") : "—";
}

function format(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export default function EmployeesPage() {
  const [rows, setRows] = useState<Employee[]>([]);
  const [masters, setMasters] = useState<MasterData>({});
  const [editing, setEditing] = useState<Partial<Employee> | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [employeeResponse, masterResponse] = await Promise.all([
      fetch("/api/employees", { cache: "no-store" }),
      fetch("/api/masters", { cache: "no-store" }),
    ]);
    const [employees, masterValues] = await Promise.all([employeeResponse.json(), masterResponse.json()]);
    setRows(employees.data ?? []);
    setMasters(masterValues.data ?? {});
    setLoading(false);
  }, []);

  // Re-read the masters when the form opens so a company just added in Master Data shows up immediately.
  const refreshMasters = useCallback(async () => {
    const response = await fetch("/api/masters", { cache: "no-store" });
    if (response.ok) setMasters((await response.json()).data ?? {});
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo<TableColumn<Employee>[]>(
    () => [
      { key: "row", label: "S.No", render: (_, index) => index + 1, filterValue: (_, index) => index + 1 },
      { key: "employeeCode", label: "Employee Code", render: (row) => row.permanentId, filterValue: (row) => row.permanentId },
      { key: "code", label: "CODE", render: (row) => format(row.dynamicId), filterValue: (row) => row.dynamicId },
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
      {
        key: "edit",
        label: "Edit",
        filterable: false,
        render: (row) => (
          <button
            className="rounded-md bg-stone-100 px-2 py-1 text-kenko-green"
            onClick={() => {
              void refreshMasters();
              setEditing({
                ...row,
                joiningDate: row.joiningDate ? String(row.joiningDate).slice(0, 10) : "",
                exitDate: row.exitDate ? String(row.exitDate).slice(0, 10) : "",
                dateOfBirth: row.dateOfBirth ? String(row.dateOfBirth).slice(0, 10) : "",
              });
            }}
          >
            Edit
          </button>
        ),
      },
    ],
    [refreshMasters],
  );

  const errors: Record<string, string> = {};
  if (editing) {
    for (const [key, rule] of Object.entries(inputRules)) {
      if (rule.validate) errors[key] = fieldError(rule.validate, editing[key], key === "phone");
    }
    if (editing.status === "EXITED") {
      if (!editing.exitDate) errors.exitDate = "Last working day is required when status is Exit";
      else if (editing.joiningDate && String(editing.exitDate) < String(editing.joiningDate)) errors.exitDate = "Cannot be earlier than the joining date";
    }
  }
  const hasErrors = Object.values(errors).some(Boolean);

  async function save() {
    if (!editing || hasErrors) return;
    setSaving(true);
    setNotice("");
    const response = await fetch(editing.id ? `/api/employees/${editing.id}` : "/api/employees", {
      method: editing.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) return setNotice(body.error ?? "Unable to save employee");
    setEditing(null);
    setNotice(editing.id ? "Employee updated and CODE recalculated." : "Employee added to the master.");
    await load();
  }

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Employee Master</h2>
          <p className="text-sm text-stone-500">Controlled employee records with a dynamic organisation CODE.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => { void refreshMasters(); setEditing({ pfEligible: false, status: "ACTIVE" }); }}>
            + Add employee
          </button>
          <a href="/api/export?type=employees" className="btn-green">
            Export Excel
          </a>
        </div>
      </div>
      <div className="card overflow-hidden p-0">
        <FilterableTable rows={rows} columns={columns} loading={loading} emptyMessage="No employees found." />
      </div>
      {notice && <p className="mt-4 rounded-lg bg-orange-50 p-3 text-sm text-orange-900">{notice}</p>}
      {editing && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-2 sm:p-4">
          <section className="mx-auto my-4 max-w-5xl rounded-2xl bg-white p-4 shadow-xl sm:my-8 sm:p-6">
            <div className="flex justify-between">
              <div>
                <h3 className="text-xl font-bold">{editing.id ? "Edit employee" : "Add employee"}</h3>
                {editing.id && <p className="text-sm text-stone-500">{editing.permanentId} · {editing.dynamicId || "CODE pending master fields"}</p>}
              </div>
              <button aria-label="Close" onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {textFields.map(([key, label]) => {
                const rule = inputRules[key];
                return (
                  <label className="text-sm" key={key}>
                    {label}
                    <input
                      aria-invalid={Boolean(errors[key])}
                      autoCapitalize={key === "pan" || key === "ifscCode" ? "characters" : undefined}
                      className={`input mt-1 ${errors[key] ? "border-red-500" : ""}`}
                      inputMode={rule?.inputMode}
                      maxLength={rule?.maxLength}
                      required={key === "name" || key === "phone"}
                      type={key === "email" || key === "personalEmail" ? "email" : "text"}
                      value={String(editing[key] ?? "")}
                      onChange={(event) => setEditing({ ...editing, [key]: rule?.clean ? rule.clean(event.target.value) : event.target.value })}
                    />
                    {errors[key] && <span className="mt-1 block text-xs text-red-700">{errors[key]}</span>}
                  </label>
                );
              })}
              {masterFields.map(([key, label, masterKey]) => (
                <label className="text-sm" key={key}>
                  {label}
                  <select
                    className="input mt-1"
                    value={String(editing[key] ?? "")}
                    onChange={(event) => setEditing({ ...editing, [key]: event.target.value })}
                  >
                    <option value="">Select {label.toLowerCase()}</option>
                    {(masters[masterKey] ?? []).filter((item) => item.active !== false || item.id === editing[key]).map((item) => (
                      <option value={item.id} key={item.id}>{item.code} · {item.name}</option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="text-sm">
                No. of outlets
                <input className="input mt-1" min={1} type="number" value={String(editing.numberOfOutlets ?? "")} onChange={(event) => setEditing({ ...editing, numberOfOutlets: event.target.value })} />
              </label>
              {[
                ["joiningDate", "Date of joining"],
                ["dateOfBirth", "Date of birth"],
              ].map(([key, label]) => (
                <label className="text-sm" key={key}>
                  {label}
                  <input className="input mt-1" type="date" value={String(editing[key] ?? "")} onChange={(event) => setEditing({ ...editing, [key]: event.target.value })} />
                </label>
              ))}
              {editing.status === "EXITED" && (
                <label className="text-sm">
                  Last working day
                  <input
                    aria-invalid={Boolean(errors.exitDate)}
                    className={`input mt-1 ${errors.exitDate ? "border-red-500" : ""}`}
                    min={String(editing.joiningDate ?? "") || undefined}
                    required
                    type="date"
                    value={String(editing.exitDate ?? "")}
                    onChange={(event) => setEditing({ ...editing, exitDate: event.target.value })}
                  />
                  {errors.exitDate && <span className="mt-1 block text-xs text-red-700">{errors.exitDate}</span>}
                </label>
              )}
              <label className="text-sm">
                Gender
                <select className="input mt-1" value={String(editing.gender ?? "")} onChange={(event) => setEditing({ ...editing, gender: event.target.value })}>
                  <option value="">Select gender</option>
                  <option value="FEMALE">Female</option>
                  <option value="MALE">Male</option>
                  <option value="NON_BINARY">Non-binary</option>
                  <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
                </select>
              </label>
              <label className="text-sm">
                State / UT
                <select className="input mt-1" value={String(editing.state ?? "")} onChange={(event) => setEditing({ ...editing, state: event.target.value })}>
                  <option value="">Select state or UT</option>
                  {INDIAN_STATES_AND_UTS.map((state) => <option key={state}>{state}</option>)}
                </select>
              </label>
              <label className="text-sm">
                Employment status
                <select className="input mt-1" value={String(editing.status ?? "ACTIVE")} onChange={(event) => setEditing({ ...editing, status: event.target.value, ...(event.target.value === "EXITED" ? {} : { exitDate: "" }) })}>
                  <option value="ACTIVE">Active</option>
                  <option value="ON_LEAVE">On leave</option>
                  <option value="EXITED">Exited</option>
                </select>
              </label>
              <label className="text-sm">
                PF eligible
                <select className="input mt-1" value={editing.pfEligible ? "yes" : "no"} onChange={(event) => setEditing({ ...editing, pfEligible: event.target.value === "yes" })}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
            </div>
            <p className="mt-4 rounded-lg bg-green-50 p-3 text-xs text-green-900">
              CODE is generated as City-Outlet Model-Special/Area-No. of Outlets-Department-Role-Employee number once all dependent master fields are selected.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary disabled:opacity-50" disabled={hasErrors || saving} onClick={save}>{saving ? "Saving…" : "Save employee"}</button>
            </div>
          </section>
        </div>
      )}
    </Shell>
  );
}
