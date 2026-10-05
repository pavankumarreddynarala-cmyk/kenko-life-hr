"use client";

import { fieldError } from "@/lib/field-rules";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FilterableTable, TableColumn } from "@/components/filterable-table";
import { ScanQrButton } from "@/components/qr-scanner";
import { INDIAN_STATES_AND_UTS } from "@/lib/validators";
import { ApiRequestError, requestJson } from "@/lib/client-api";

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

function date(value: string) {
  return new Date(value).toLocaleDateString("en-IN");
}

const onlyDigits = (value: string) => value.replace(/\D/g, "");
const onboardingRules: Record<string, { inputMode?: "numeric" | "text"; maxLength?: number; clean?: (v: string) => string; validate?: "pan" | "phone" }> = {
  phone: { inputMode: "numeric", maxLength: 10, clean: onlyDigits, validate: "phone" },
  pan: { maxLength: 10, clean: (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ""), validate: "pan" },
  aadhaar: { inputMode: "numeric", maxLength: 12, clean: onlyDigits },
  pinCode: { inputMode: "numeric", maxLength: 6, clean: onlyDigits },
};

export default function EmployeePortalPage() {
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<"email" | "emailSent" | "completing" | "onboarding" | "portal">("email");
  const [tab, setTab] = useState<"assets" | "requests">("assets");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"send" | "complete" | "onboarding" | "request" | "resolve" | null>(null);
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
    try {
      const body = await requestJson<{ employee: EmployeeSelf }>("/api/employee/self", {
        cache: "no-store",
      });
      setEmployee(body.employee);
      setStage("portal");
      return true;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) return false;
      setMessage(error instanceof Error ? error.message : "Unable to load the employee portal.");
      return false;
    }
  }, []);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = parameters.get("access_token");
    const authError = parameters.get("error_description");
    if (!accessToken && !authError) {
      void loadSelf();
      return;
    }

    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    if (authError) {
      setStage("email");
      setMessage(authError);
      return;
    }

    setStage("completing");
    setBusy("complete");
    setMessage("Verifying your secure email link…");
    void requestJson<{ isNew: boolean; email: string }>("/api/auth/email/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    })
      .then(async (body) => {
        setEmail(body.email);
        if (body.isNew) {
          setForm((current) => ({ ...current, email: body.email }));
          setStage("onboarding");
          setMessage("Email verified. Complete your employee profile.");
          return;
        }
        await loadSelf();
      })
      .catch((error: unknown) => {
        setStage("email");
        setMessage(error instanceof Error ? error.message : "Unable to complete email sign-in.");
      })
      .finally(() => {
        setBusy(null);
      });
  }, [loadSelf]);

  async function sendLoginEmail() {
    setMessage("");
    setBusy("send");
    try {
      const body = await requestJson<{ message: string; email: string }>("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setEmail(body.email);
      setMessage(body.message);
      setStage("emailSent");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send the secure login email.");
    } finally {
      setBusy(null);
    }
  }

  async function saveOnboarding() {
    setMessage("");
    setBusy("onboarding");
    try {
      const body = await requestJson<{ employee: EmployeeSelf }>("/api/employee/self", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setMessage(`Welcome. Your Employee ID is ${body.employee.permanentId}.`);
      await loadSelf();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to complete onboarding.");
    } finally {
      setBusy(null);
    }
  }

  async function createRequest() {
    if (!requestingAsset) return;
    setBusy("request");
    try {
      await requestJson("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: requestingAsset.id, ...request }),
      });
      setRequestingAsset(null);
      setRequest({ receiverEmployeeCode: "", reason: "" });
      setMessage("Transfer request sent to the receiving employee.");
      await loadSelf();
      setTab("requests");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send the transfer request.");
    } finally {
      setBusy(null);
    }
  }

  const resolveRequest = useCallback(async (transferId: string, action: "ACCEPT" | "REJECT" | "REVOKE") => {
    setBusy("resolve");
    try {
      await requestJson(`/api/transfers/${transferId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setMessage(`Request ${action.toLowerCase()}ed.`);
      await loadSelf();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update the request.");
    } finally {
      setBusy(null);
    }
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
          <p className="mt-2 text-sm text-stone-500">Secure email sign-in and employee onboarding. No Employee ID is required.</p>
          {stage === "email" && (
            <form
              className="mt-6 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void sendLoginEmail();
              }}
            >
              <label className="block text-sm font-medium">
                Email address
                <input autoComplete="email" className="input mt-1" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
              </label>
              <p className="text-xs text-stone-500">We will email a one-time secure link. New employees can complete onboarding after verification.</p>
              <button className="btn-primary w-full disabled:opacity-60" disabled={busy !== null} type="submit">{busy === "send" ? "Sending…" : "Email me a secure login link"}</button>
            </form>
          )}
          {stage === "emailSent" && (
            <div className="mt-6 space-y-3">
              <p className="rounded-lg bg-green-50 p-4 text-sm text-green-900">A secure login link was sent to <strong>{email}</strong>. Open it in this browser to continue.</p>
              <button className="w-full text-sm text-stone-500 underline" onClick={() => setStage("email")}>Use another email address</button>
            </div>
          )}
          {stage === "completing" && (
            <p className="mt-6 rounded-lg bg-green-50 p-4 text-sm text-green-900">Verifying your secure email link…</p>
          )}
          {stage === "onboarding" && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Verified email address
                <input className="input mt-1 bg-stone-100" disabled type="email" value={form.email} />
              </label>
              {[
                ["phone", "Mobile number", "text"],
                ["name", "Name as per PAN card", "text"],
                ["dateOfBirth", "Date of birth", "date"],
                ["pan", "PAN number", "text"],
                ["aadhaar", "Aadhaar number", "text"],
                ["address1", "Address line 1", "text"],
                ["address2", "Address line 2", "text"],
                ["pinCode", "PIN code", "text"],
              ].map(([key, label, type]) => {
                const rule = onboardingRules[key];
                const error = rule?.validate ? fieldError(rule.validate, form[key], key === "phone") : "";
                return (
                  <label className="text-sm" key={key}>
                    {label}
                    <input
                      aria-invalid={Boolean(error)}
                      autoCapitalize={key === "pan" ? "characters" : undefined}
                      className={`input mt-1 ${error ? "border-red-500" : ""}`}
                      inputMode={rule?.inputMode}
                      maxLength={rule?.maxLength}
                      required={key !== "address2"}
                      type={type}
                      value={form[key] ?? ""}
                      onChange={(event) => setForm({ ...form, [key]: rule?.clean ? rule.clean(event.target.value) : event.target.value })}
                    />
                    {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
                  </label>
                );
              })}
              <label className="text-sm sm:col-span-2">
                State / Union Territory
                <select className="input mt-1" value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })}>
                  <option value="">Select state or UT</option>
                  {INDIAN_STATES_AND_UTS.map((state) => <option key={state}>{state}</option>)}
                </select>
              </label>
              <button className="btn-primary sm:col-span-2 disabled:opacity-60" disabled={busy !== null} onClick={saveOnboarding}>{busy === "onboarding" ? "Saving…" : "Complete onboarding"}</button>
            </div>
          )}
          {message && <p aria-live="polite" className="mt-4 rounded-lg bg-orange-50 p-3 text-sm text-orange-900" role="alert">{message}</p>}
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
            <p className="text-sm text-stone-500">{employee?.permanentId} · {employee?.email || employee?.phone}</p>
          </div>
          <a className="btn" href="/login">Management sign in</a>
        </header>
        <div className="mb-4 flex items-center gap-2">
          <button className={tab === "assets" ? "btn-primary" : "btn"} onClick={() => setTab("assets")}>My Assets</button>
          <button className={tab === "requests" ? "btn-primary" : "btn"} onClick={() => setTab("requests")}>Requests</button>
          <ScanQrButton className="ml-auto" />
        </div>
        <section className="card overflow-hidden p-0">
          {tab === "assets" ? (
            <FilterableTable rows={assetRows} columns={assetColumns} emptyMessage="No assets are currently assigned to you." />
          ) : (
            <FilterableTable rows={requestRows} columns={requestColumns} emptyMessage="No incoming or outgoing transfer requests." />
          )}
        </section>
        {message && <p aria-live="polite" className="mt-4 rounded-lg bg-orange-50 p-3 text-sm text-orange-900" role="alert">{message}</p>}
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
              <button className="btn-primary disabled:opacity-60" disabled={busy !== null} onClick={createRequest}>{busy === "request" ? "Sending…" : "Send request"}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
