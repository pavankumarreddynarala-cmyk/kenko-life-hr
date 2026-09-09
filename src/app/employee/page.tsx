"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FilterableTable, TableColumn } from "@/components/filterable-table";
import { INDIAN_STATES_AND_UTS } from "@/lib/validators";

type Asset = {
  id: string;
  faId: string;
  category: string;
  description: string;
  makeModel?: string;
  serialNo?: string;
  status: string;
  qr?: { token: string };
};
type Transfer = {
  id: string;
  asset: Asset;
  sender?: { permanentId: string; name: string };
  receiver?: { permanentId: string; name: string };
  status: string;
  reason?: string;
  effectiveDate: string;
  registeredDate: string;
};
type EmployeeSelf = {
  id: string;
  permanentId: string;
  name: string;
  phone: string;
  email?: string;
  dateOfBirth?: string;
  pan?: string;
  aadhaar?: string;
  address1?: string;
  address2?: string;
  pinCode?: string;
  state?: string;
  assignments: Array<{ id: string; asset: Asset }>;
  sentTransfers: Transfer[];
  receivedTransfers: Transfer[];
};
type RequestRow = Transfer & { id: string; transferId: string; direction: "Outgoing" | "Incoming" };

function normalizedPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits.length === 11 && digits.startsWith("0")
      ? digits.slice(1)
      : digits;
  return `+91${national}`;
}

function date(value: string) {
  return new Date(value).toLocaleDateString("en-IN");
}

export default function EmployeePortalPage() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"phone" | "otp" | "onboarding" | "portal">("phone");
  const [tab, setTab] = useState<"assets" | "requests">("assets");
  const [message, setMessage] = useState("");
  const [employee, setEmployee] = useState<EmployeeSelf | null>(null);
  const [requestingAsset, setRequestingAsset] = useState<Asset | null>(null);
  const [request, setRequest] = useState({ receiverEmployeeCode: "", reason: "" });
  const [form, setForm] = useState<Record<string, string>>({
    phone: "",
    name: "",
    dateOfBirth: "",
    email: "",
    pan: "",
    aadhaar: "",
    address1: "",
    address2: "",
    pinCode: "",
    state: "",
  });

  const loadSelf = useCallback(async () => {
    const response = await fetch("/api/employee/self", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) return false;
    setEmployee(body.employee);
    setStage("portal");
    return true;
  }, []);

  useEffect(() => {
    void loadSelf();
  }, [loadSelf]);

  async function send() {
    setMessage("");
    const response = await fetch("/api/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const body = await response.json();
    setMessage(body.message ?? body.error);
    if (response.ok) setStage("otp");
  }

  async function verify() {
    setMessage("");
    const response = await fetch("/api/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, otp }),
    });
    const body = await response.json();
    if (!response.ok) return setMessage(body.error);
    if (body.isNew) {
      setForm((current) => ({ ...current, phone: normalizedPhone(phone) }));
      setStage("onboarding");
      setMessage("Mobile verified. Complete your employee profile.");
    } else {
      await loadSelf();
    }
  }

  async function saveOnboarding() {
    setMessage("");
    const response = await fetch("/api/employee/self", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await response.json();
    if (!response.ok) return setMessage(body.error);
    setMessage(`Welcome. Your Employee ID is ${body.employee.permanentId}.`);
    await loadSelf();
  }

  async function createRequest() {
    if (!requestingAsset) return;
    const response = await fetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: requestingAsset.id, ...request }),
    });
    const body = await response.json();
    if (!response.ok) return setMessage(body.error);
    setRequestingAsset(null);
    setRequest({ receiverEmployeeCode: "", reason: "" });
    setMessage("Transfer request sent to the receiving employee.");
    await loadSelf();
    setTab("requests");
  }

  const resolveRequest = useCallback(async (transferId: string, action: "ACCEPT" | "REJECT" | "REVOKE") => {
    const response = await fetch(`/api/transfers/${transferId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await response.json();
    setMessage(response.ok ? `Request ${action.toLowerCase()}ed.` : body.error);
    if (response.ok) await loadSelf();
  }, [loadSelf]);

  const assetRows = useMemo(() => employee?.assignments.map((assignment) => assignment.asset) ?? [], [employee]);
  const requestRows = useMemo<RequestRow[]>(
    () => [
      ...(employee?.sentTransfers.map((transfer) => ({ ...transfer, id: `out-${transfer.id}`, transferId: transfer.id, direction: "Outgoing" as const })) ?? []),
      ...(employee?.receivedTransfers.map((transfer) => ({ ...transfer, id: `in-${transfer.id}`, transferId: transfer.id, direction: "Incoming" as const })) ?? []),
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
      { key: "status", label: "Status", render: (row) => row.status, filterValue: (row) => row.status },
      {
        key: "request",
        label: "Transfer",
        filterable: false,
        render: (row) => (
          <button className="text-kenko-orange underline disabled:text-stone-400" disabled={row.status === "PENDING_TRANSFER"} onClick={() => setRequestingAsset(row)}>
            Request transfer
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
      { key: "from", label: "From", render: (row) => row.sender ? `${row.sender.permanentId} · ${row.sender.name}` : "Unassigned", filterValue: (row) => `${row.sender?.permanentId} ${row.sender?.name}` },
      { key: "to", label: "To", render: (row) => row.receiver ? `${row.receiver.permanentId} · ${row.receiver.name}` : "—", filterValue: (row) => `${row.receiver?.permanentId} ${row.receiver?.name}` },
      { key: "effective", label: "Effective", render: (row) => date(row.effectiveDate), filterValue: (row) => date(row.effectiveDate) },
      { key: "registered", label: "Registered", render: (row) => date(row.registeredDate), filterValue: (row) => date(row.registeredDate) },
      { key: "reason", label: "Reason", render: (row) => row.reason || "—", filterValue: (row) => row.reason },
      { key: "status", label: "Status", render: (row) => row.status, filterValue: (row) => row.status },
      {
        key: "actions",
        label: "Actions",
        filterable: false,
        render: (row) =>
          row.status === "PENDING" ? (
            row.direction === "Incoming" ? (
              <div className="flex gap-2">
                <button className="text-kenko-green underline" onClick={() => resolveRequest(row.transferId, "ACCEPT")}>Approve</button>
                <button className="text-kenko-orange underline" onClick={() => resolveRequest(row.transferId, "REJECT")}>Decline</button>
              </div>
            ) : (
              <button className="text-stone-600 underline" onClick={() => resolveRequest(row.transferId, "REVOKE")}>Revoke</button>
            )
          ) : "—",
      },
    ],
    [resolveRequest],
  );

  if (stage !== "portal") {
    return (
      <main className="min-h-screen bg-kenko-cream p-5">
        <div className="card mx-auto mt-12 max-w-2xl">
          <p className="text-sm font-bold tracking-widest text-kenko-green">THE KENKO LIFE</p>
          <h1 className="mt-2 text-3xl font-bold">Employee Portal</h1>
          <p className="mt-2 text-sm text-stone-500">Secure mobile OTP sign-in and employee onboarding.</p>
          {stage === "phone" && (
            <div className="mt-6 space-y-3">
              <label className="text-sm font-medium">Mobile number</label>
              <input className="input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+919876543210" />
              <button className="btn-primary w-full" onClick={send}>Send OTP</button>
            </div>
          )}
          {stage === "otp" && (
            <div className="mt-6 space-y-3">
              <input className="input" inputMode="numeric" value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="Enter OTP" />
              <button className="btn-primary w-full" onClick={verify}>Verify securely</button>
              <button className="w-full text-sm text-stone-500 underline" onClick={() => setStage("phone")}>Use another number</button>
            </div>
          )}
          {stage === "onboarding" && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                ["name", "Name as per PAN card", "text"],
                ["dateOfBirth", "Date of birth", "date"],
                ["email", "Email ID", "email"],
                ["pan", "PAN number", "text"],
                ["aadhaar", "Aadhaar number", "text"],
                ["address1", "Address line 1", "text"],
                ["address2", "Address line 2", "text"],
                ["pinCode", "PIN code", "text"],
              ].map(([key, label, type]) => (
                <label className="text-sm" key={key}>
                  {label}
                  <input className="input mt-1" required={key !== "address2"} type={type} value={form[key] ?? ""} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
                </label>
              ))}
              <label className="text-sm sm:col-span-2">
                State / Union Territory
                <select className="input mt-1" value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })}>
                  <option value="">Select state or UT</option>
                  {INDIAN_STATES_AND_UTS.map((state) => <option key={state}>{state}</option>)}
                </select>
              </label>
              <button className="btn-primary sm:col-span-2" onClick={saveOnboarding}>Complete onboarding</button>
            </div>
          )}
          {message && <p className="mt-4 rounded-lg bg-orange-50 p-3 text-sm text-orange-900">{message}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-kenko-cream p-5 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-widest text-kenko-green">EMPLOYEE PORTAL</p>
            <h1 className="text-3xl font-bold">{employee?.name}</h1>
            <p className="text-sm text-stone-500">{employee?.permanentId} · {employee?.phone}</p>
          </div>
          <a className="btn" href="/login">Management sign in</a>
        </header>
        <div className="mb-4 flex gap-2">
          <button className={tab === "assets" ? "btn-primary" : "btn"} onClick={() => setTab("assets")}>My Assets</button>
          <button className={tab === "requests" ? "btn-primary" : "btn"} onClick={() => setTab("requests")}>Requests</button>
        </div>
        <section className="card overflow-hidden p-0">
          {tab === "assets" ? (
            <FilterableTable rows={assetRows} columns={assetColumns} emptyMessage="No assets are currently assigned to you." />
          ) : (
            <FilterableTable rows={requestRows} columns={requestColumns} emptyMessage="No incoming or outgoing transfer requests." />
          )}
        </section>
        {message && <p className="mt-4 rounded-lg bg-orange-50 p-3 text-sm text-orange-900">{message}</p>}
      </div>
      {requestingAsset && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4">
          <section className="mx-auto mt-24 max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex justify-between">
              <div>
                <h2 className="text-xl font-bold">Request asset transfer</h2>
                <p className="text-sm text-stone-500">{requestingAsset.faId} · {requestingAsset.description}</p>
              </div>
              <button aria-label="Close" onClick={() => setRequestingAsset(null)}>×</button>
            </div>
            <label className="mt-5 block text-sm">
              Receiving Employee ID
              <input className="input mt-1" placeholder="EMP0001" value={request.receiverEmployeeCode} onChange={(event) => setRequest({ ...request, receiverEmployeeCode: event.target.value.toUpperCase() })} />
            </label>
            <label className="mt-3 block text-sm">
              Reason
              <textarea className="input mt-1" rows={3} value={request.reason} onChange={(event) => setRequest({ ...request, reason: event.target.value })} />
            </label>
            <div className="mt-5 flex justify-end gap-3">
              <button className="btn" onClick={() => setRequestingAsset(null)}>Cancel</button>
              <button className="btn-primary" onClick={createRequest}>Send request</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
