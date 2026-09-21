"use client";

import Link from "next/link";
import type { Route } from "next";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { FilterableTable, TableColumn } from "@/components/filterable-table";
import { Field, inputClass, Modal, RequiredLegend } from "@/components/form";
import { useToast } from "@/components/toast";
import { fieldErrorMap, jsonBody, requestJson } from "@/lib/client-api";
import { requiredErrors, type FormErrors } from "@/lib/form-validation";
import { EMPLOYEE_TABS, type EmployeeTabKey } from "@/lib/employee-tabs";

type MasterItem = { id: string; name: string; code: string };
type Asset = {
  id: string;
  faId: string;
  category: string;
  description: string;
  makeModel?: string;
  serialNo?: string;
  status: string;
  invoiceDate?: string;
  capitalisationDate?: string;
};
type Person = { permanentId: string; name: string };
type Transfer = {
  id: string;
  asset: Asset;
  sender?: Person;
  receiver?: Person;
  status: string;
  reason?: string;
  effectiveDate: string;
  registeredDate: string;
};
type Profile = {
  id: string;
  permanentId: string;
  dynamicId?: string;
  teamOfficeCode?: string;
  name: string;
  phone: string;
  email?: string;
  personalEmail?: string;
  fatherName?: string;
  gender?: string;
  dateOfBirth?: string;
  pan?: string;
  aadhaar?: string;
  address1?: string;
  address2?: string;
  pinCode?: string;
  state?: string;
  bankHolderName?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  pfEligible: boolean;
  pfAccountNumber?: string;
  uanNumber?: string;
  esicNumber?: string;
  numberOfOutlets?: number;
  status: string;
  joiningDate?: string;
  exitDate?: string;
  updatedAt: string;
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
  assignments: Array<{ id: string; asset: Asset }>;
  sentTransfers: Transfer[];
  receivedTransfers: Transfer[];
};
type RequestRow = Transfer & { transferId: string; direction: "Outgoing" | "Incoming" };



const dash = (value: unknown) => (value === null || value === undefined || value === "" ? "—" : String(value));
const day = (value?: string | null) => (value ? new Date(value).toLocaleDateString("en-IN") : "—");
const master = (item?: MasterItem) => (item ? `${item.name} (${item.code})` : "—");
const titleCase = (value?: string) =>
  value ? value.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—";

function DetailGrid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(([label, value]) => (
        <div className="rounded-xl bg-stone-50 p-3" key={label}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</dt>
          <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="card">
      <div className="mb-4">
        <h3 className="font-bold">{title}</h3>
        <p className="text-xs text-stone-500">{note}</p>
      </div>
      {children}
    </section>
  );
}

export function EmployeeWorkspace({ tab: active }: { tab: EmployeeTabKey }) {
  const toast = useToast();
  const [employee, setEmployee] = useState<Profile | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [requestingAsset, setRequestingAsset] = useState<Asset | null>(null);
  const [request, setRequest] = useState({ receiverEmployeeCode: "", reason: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState<"request" | "resolve" | null>(null);

  const load = useCallback(async () => {
    try {
      const body = await requestJson<{ employee: Profile }>("/api/employee/self", { cache: "no-store" });
      setEmployee(body.employee);
      setLoadFailed(false);
    } catch (error) {
      setLoadFailed(true);
      toast.fromError(error, "Your profile could not be loaded");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createRequest() {
    if (!requestingAsset) return;
    const missing = requiredErrors(request, ["receiverEmployeeCode"], { receiverEmployeeCode: "Receiving Employee ID" });
    if (missing.receiverEmployeeCode) {
      setErrors(missing);
      toast.error("Enter the Employee ID of the person who should receive this asset (for example EMP0042).", { title: "Request not sent" });
      return;
    }
    setBusy("request");
    try {
      await requestJson("/api/transfers", jsonBody("POST", { assetId: requestingAsset.id, ...request }));
      setRequestingAsset(null);
      setRequest({ receiverEmployeeCode: "", reason: "" });
      setErrors({});
      toast.success("Your transfer request was sent. The receiving employee has to approve it.", { title: "Request sent" });
      await load();
    } catch (error) {
      setErrors(fieldErrorMap(error));
      toast.fromError(error, "Request not sent");
    } finally {
      setBusy(null);
    }
  }

  const resolveRequest = useCallback(
    async (transferId: string, action: "ACCEPT" | "REJECT" | "REVOKE") => {
      setBusy("resolve");
      try {
        await requestJson(`/api/transfers/${transferId}`, jsonBody("PATCH", { action }));
        toast.success(
          action === "ACCEPT" ? "You approved the transfer. The asset is now assigned to you." : action === "REJECT" ? "You declined the transfer." : "Your request was withdrawn.",
        );
        await load();
      } catch (error) {
        toast.fromError(error, "The request was not updated");
      } finally {
        setBusy(null);
      }
    },
    [load, toast],
  );

  const assetRows = useMemo(() => employee?.assignments.map((assignment) => assignment.asset) ?? [], [employee]);
  const requestRows = useMemo<RequestRow[]>(
    () => [
      ...(employee?.sentTransfers.map((t) => ({ ...t, id: `out-${t.id}`, transferId: t.id, direction: "Outgoing" as const })) ?? []),
      ...(employee?.receivedTransfers.map((t) => ({ ...t, id: `in-${t.id}`, transferId: t.id, direction: "Incoming" as const })) ?? []),
    ],
    [employee],
  );

  const assetColumns = useMemo<TableColumn<Asset>[]>(
    () => [
      { key: "id", label: "Asset ID", render: (row) => row.faId, filterValue: (row) => row.faId },
      { key: "category", label: "Category", render: (row) => row.category, filterValue: (row) => row.category },
      { key: "description", label: "Description", render: (row) => row.description, filterValue: (row) => row.description },
      { key: "model", label: "Make / Model", render: (row) => row.makeModel || "—", filterValue: (row) => row.makeModel },
      { key: "serial", label: "Serial No.", render: (row) => row.serialNo || "—", filterValue: (row) => row.serialNo },
      { key: "status", label: "Status", render: (row) => titleCase(row.status), filterValue: (row) => row.status },
      {
        key: "request",
        label: "Transfer",
        filterable: false,
        render: (row) => (
          <button className="text-kenko-orange underline disabled:text-stone-400 disabled:no-underline" disabled={row.status === "PENDING_TRANSFER"} onClick={() => setRequestingAsset(row)}>
            {row.status === "PENDING_TRANSFER" ? "Transfer pending" : "Request transfer"}
          </button>
        ),
      },
    ],
    [],
  );
  const requestColumns = useMemo<TableColumn<RequestRow>[]>(
    () => [
      { key: "direction", label: "Direction", render: (row) => row.direction, filterValue: (row) => row.direction },
      { key: "asset", label: "Asset ID", render: (row) => row.asset.faId, filterValue: (row) => row.asset.faId },
      { key: "from", label: "From", render: (row) => (row.sender ? `${row.sender.permanentId} · ${row.sender.name}` : "Unassigned"), filterValue: (row) => `${row.sender?.permanentId} ${row.sender?.name}` },
      { key: "to", label: "To", render: (row) => (row.receiver ? `${row.receiver.permanentId} · ${row.receiver.name}` : "—"), filterValue: (row) => `${row.receiver?.permanentId} ${row.receiver?.name}` },
      { key: "effective", label: "Effective", render: (row) => day(row.effectiveDate), filterValue: (row) => day(row.effectiveDate) },
      { key: "registered", label: "Registered", render: (row) => day(row.registeredDate), filterValue: (row) => day(row.registeredDate) },
      { key: "reason", label: "Reason", render: (row) => row.reason || "—", filterValue: (row) => row.reason },
      { key: "status", label: "Status", render: (row) => titleCase(row.status), filterValue: (row) => row.status },
      {
        key: "actions",
        label: "Actions",
        filterable: false,
        render: (row) =>
          row.status === "PENDING" ? (
            row.direction === "Incoming" ? (
              <div className="flex gap-3">
                <button className="text-kenko-green underline disabled:opacity-50" disabled={busy !== null} onClick={() => resolveRequest(row.transferId, "ACCEPT")}>Approve</button>
                <button className="text-kenko-orange underline disabled:opacity-50" disabled={busy !== null} onClick={() => resolveRequest(row.transferId, "REJECT")}>Decline</button>
              </div>
            ) : (
              <button className="text-stone-600 underline disabled:opacity-50" disabled={busy !== null} onClick={() => resolveRequest(row.transferId, "REVOKE")}>Revoke</button>
            )
          ) : (
            "—"
          ),
      },
    ],
    [resolveRequest, busy],
  );

  if (!employee) {
    return (
      <div className="card text-sm text-stone-500">
        {loadFailed ? (
          <>
            Your profile could not be loaded. <button className="text-kenko-orange underline" onClick={() => void load()}>Try again</button>
          </>
        ) : (
          "Loading your profile…"
        )}
      </div>
    );
  }

  const address = [employee.address1, employee.address2].filter(Boolean).join(", ");
  const pendingIncoming = employee.receivedTransfers.filter((t) => t.status === "PENDING").length;

  return (
    <>
      <div className="mb-5">
        <p className="text-xs font-bold tracking-widest text-kenko-green">MY PROFILE</p>
        <h2 className="break-words text-2xl font-bold sm:text-3xl">{employee.name}</h2>
        <p className="text-sm text-stone-500">
          {employee.permanentId} · {employee.email} · {titleCase(employee.status)}
        </p>
      </div>

      <nav aria-label="Profile sections" className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {EMPLOYEE_TABS.map((tab) => (
          <Link key={tab.key} href={tab.href as Route} aria-current={active === tab.key ? "page" : undefined} className={`${active === tab.key ? "btn-primary" : "btn border border-stone-200 bg-white"} whitespace-nowrap`}>
            {tab.label}
            {tab.key === "assets" && ` (${assetRows.length})`}
            {tab.key === "requests" && requestRows.length > 0 && ` (${pendingIncoming ? `${pendingIncoming} to review` : requestRows.length})`}
          </Link>
        ))}
      </nav>

      {active === "personal" && (
        <Section title="Personal details" note={`What you entered at onboarding. Last updated ${day(employee.updatedAt)}.`}>
          <DetailGrid
            rows={[
              ["Name as per PAN card", dash(employee.name)],
              ["Date of birth", day(employee.dateOfBirth)],
              ["Gender", titleCase(employee.gender)],
              ["Father's name", dash(employee.fatherName)],
              ["Mobile number", dash(employee.phone)],
              ["Email (verified)", dash(employee.email)],
              ["Personal email", dash(employee.personalEmail)],
              ["PAN number", dash(employee.pan)],
              ["Aadhaar number", dash(employee.aadhaar)],
              ["Address", dash(address)],
              ["PIN code", dash(employee.pinCode)],
              ["State / UT", dash(employee.state)],
            ]}
          />
        </Section>
      )}

      {active === "employment" && (
        <Section title="Employment & master data" note="Maintained by HR / Admin. Contact HR if anything here looks wrong.">
          <DetailGrid
            rows={[
              ["Employee Code", dash(employee.permanentId)],
              ["Team Office Code", dash(employee.teamOfficeCode)],
              ["Organisation Code", dash(employee.dynamicId)],
              ["Employment status", titleCase(employee.status)],
              ["Date of joining", day(employee.joiningDate)],
              ["Last day of working", day(employee.exitDate)],
              ["Company", master(employee.company)],
              ["Location", master(employee.location)],
              ["City", master(employee.city)],
              ["Branch", master(employee.branch)],
              ["Outlet model", master(employee.outletModel)],
              ["Special / area code", master(employee.specialBranchCode)],
              ["No. of outlets", dash(employee.numberOfOutlets)],
              ["Department", master(employee.department)],
              ["Employee role", master(employee.employeeRole)],
              ["Designation", master(employee.designation)],
              ["Cost centre", master(employee.costCentre)],
            ]}
          />
        </Section>
      )}

      {active === "bank" && (
        <Section title="Bank & statutory details" note="Maintained by HR / Admin for payroll and compliance.">
          <DetailGrid
            rows={[
              ["Bank account holder", dash(employee.bankHolderName)],
              ["Bank name", dash(employee.bankName)],
              ["Account number", dash(employee.accountNumber)],
              ["IFSC code", dash(employee.ifscCode)],
              ["PF eligible", employee.pfEligible ? "Yes" : "No"],
              ["PF account number", dash(employee.pfAccountNumber)],
              ["UAN number", dash(employee.uanNumber)],
              ["ESIC number", dash(employee.esicNumber)],
            ]}
          />
        </Section>
      )}

      {active === "assets" && (
        <section className="card overflow-hidden p-0">
          <FilterableTable rows={assetRows} columns={assetColumns} emptyMessage="No assets are currently assigned to you." />
        </section>
      )}

      {active === "requests" && (
        <section className="card overflow-hidden p-0">
          <FilterableTable rows={requestRows} columns={requestColumns} emptyMessage="No incoming or outgoing transfer requests." />
        </section>
      )}

      {requestingAsset && (
        <Modal
          title="Request asset transfer"
          subtitle={`${requestingAsset.faId} · ${requestingAsset.description}`}
          size="max-w-lg"
          onClose={() => {
            setRequestingAsset(null);
            setErrors({});
          }}
          footer={
            <>
              <button className="btn" onClick={() => setRequestingAsset(null)}>Cancel</button>
              <button className="btn-primary disabled:opacity-60" disabled={busy !== null} onClick={createRequest}>
                {busy === "request" ? "Sending…" : "Send request"}
              </button>
            </>
          }
        >
          <RequiredLegend />
          <Field label="Receiving Employee ID" required error={errors.receiverEmployeeCode} className="mt-3">
            <input
              className={inputClass(Boolean(errors.receiverEmployeeCode))}
              placeholder="EMP0001"
              value={request.receiverEmployeeCode}
              onChange={(event) => {
                setRequest({ ...request, receiverEmployeeCode: event.target.value.toUpperCase() });
                setErrors({});
              }}
            />
          </Field>
          <Field label="Reason" className="mt-3">
            <textarea className={inputClass()} rows={3} value={request.reason} onChange={(event) => setRequest({ ...request, reason: event.target.value })} />
          </Field>
        </Modal>
      )}
    </>
  );
}
