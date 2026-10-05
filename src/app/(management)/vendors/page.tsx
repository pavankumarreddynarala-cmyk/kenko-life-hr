"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FilterableTable, TableColumn } from "@/components/filterable-table";
import { Field, inputClass, Modal } from "@/components/form";
import { useSessionUser } from "@/components/session-context";
import { useToast } from "@/components/toast";
import { VendorForm, cleanVendorInput, vendorErrors, type VendorErrors, type VendorValues } from "@/components/vendor-form";
import { describeMissing } from "@/lib/form-validation";
import { fieldErrorMap, jsonBody, requestJson } from "@/lib/client-api";
import { VENDOR_FIELDS, VENDOR_LABELS, type VendorFieldKey } from "@/lib/vendor-fields";

type Vendor = VendorValues & { id: string; email: string; status: string; active: boolean; submittedAt: string | null; createdAt: string; bankLocked: boolean };
type Invite = { link: string; emailed: boolean; emailProblem?: string; emailConfigured: boolean; email: string };

const date = (value?: string | null) => (value ? new Date(value).toLocaleDateString("en-IN") : "—");

export default function VendorsPage() {
  const user = useSessionUser();
  const toast = useToast();
  const canEditBank = user.permissions.editVendorBank;
  const [rows, setRows] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", legalName: "" });
  const [inviteError, setInviteError] = useState("");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [values, setValues] = useState<VendorValues>({});
  const [errors, setErrors] = useState<VendorErrors>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows((await requestJson<{ data: Vendor[] }>("/api/vendors", { cache: "no-store" })).data ?? []);
    } catch (error) {
      toast.fromError(error, "Vendors could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => void load(), [load]);

  async function sendInvite() {
    setBusy(true);
    setInviteError("");
    try {
      const body = await requestJson<Omit<Invite, "email">>("/api/vendors", jsonBody("POST", inviteForm));
      setInvite({ ...body, email: inviteForm.email.trim().toLowerCase() });
      setInviting(false);
      setInviteForm({ email: "", legalName: "" });
      await load();
    } catch (error) {
      const fields = fieldErrorMap(error);
      setInviteError(fields.email || (error instanceof Error ? error.message : "The link could not be created."));
    } finally {
      setBusy(false);
    }
  }

  function open(vendor: Vendor) {
    setValues(Object.fromEntries(VENDOR_FIELDS.map((field) => [field.key, vendor[field.key] ?? ""])));
    setErrors({});
    setEditing(vendor);
  }

  async function save() {
    if (!editing) return;
    const found = editing.status === "SUBMITTED" ? vendorErrors(values, { includeBank: true }) : {};
    if (Object.keys(found).length) {
      setErrors(found);
      toast.error(`Please correct: ${describeMissing(found, VENDOR_LABELS)}.`, { title: "Vendor not saved" });
      return;
    }
    setBusy(true);
    try {
      await requestJson(`/api/vendors/${editing.id}`, jsonBody("PATCH", values));
      toast.success("Vendor updated. The vendor sees the change the next time they sign in.", { title: "Saved" });
      setEditing(null);
      await load();
    } catch (error) {
      setErrors(fieldErrorMap(error));
      toast.fromError(error, "Vendor not saved");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(vendor: Vendor) {
    try {
      await requestJson(`/api/vendors/${vendor.id}`, jsonBody("PATCH", { active: !vendor.active }));
      toast.success(vendor.active ? "Vendor deactivated. They can no longer sign in." : "Vendor activated.", { title: "Saved" });
      await load();
    } catch (error) {
      toast.fromError(error, "Not changed");
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Link copied.", { title: "Copied" });
    } catch {
      toast.error("Could not copy automatically. Select the link and copy it by hand.", { title: "Copy failed" });
    }
  }

  const columns = useMemo<TableColumn<Vendor>[]>(
    () => [
      { key: "name", label: "Vendor", render: (v) => <span className="font-medium">{v.legalName || "—"}</span>, filterValue: (v) => v.legalName },
      { key: "email", label: "Email", render: (v) => v.email, filterValue: (v) => v.email },
      { key: "type", label: "Type", render: (v) => v.vendorType || "—", filterValue: (v) => v.vendorType },
      { key: "contact", label: "Contact", render: (v) => (v.contactPerson ? `${v.contactPerson} · ${v.phone ?? ""}` : "—"), filterValue: (v) => `${v.contactPerson} ${v.phone}` },
      { key: "gstin", label: "GSTIN", render: (v) => v.gstin || "—", filterValue: (v) => v.gstin },
      { key: "pan", label: "PAN", render: (v) => v.pan || "—", filterValue: (v) => v.pan },
      {
        key: "status",
        label: "Status",
        render: (v) => (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${!v.active ? "bg-stone-200 text-stone-600" : v.status === "SUBMITTED" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
            {!v.active ? "Inactive" : v.status === "SUBMITTED" ? "Submitted" : "Link sent"}
          </span>
        ),
        filterValue: (v) => (!v.active ? "inactive" : v.status === "SUBMITTED" ? "submitted" : "link sent"),
      },
      { key: "submitted", label: "Submitted", render: (v) => date(v.submittedAt), filterable: false },
      {
        key: "actions",
        label: "Actions",
        filterable: false,
        render: (v) => (
          <div className="flex gap-2 whitespace-nowrap">
            <button className="rounded-md bg-stone-100 px-2 py-1" onClick={() => open(v)}>{v.status === "SUBMITTED" ? "View / edit" : "Edit"}</button>
            <button className="rounded-md bg-stone-100 px-2 py-1" onClick={() => void toggleActive(v)}>{v.active ? "Deactivate" : "Activate"}</button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- row actions only need the latest rows
    [rows],
  );

  return (
    <>
      <div className="mb-4">
        <h2 className="text-2xl font-bold">Vendor Master</h2>
        <p className="text-sm text-stone-500">Send vendors a link to submit their business, tax and bank details. Vendors sign in with their email to see what they submitted.</p>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={() => { setInviting(true); setInviteError(""); }}>+ Invite vendor</button>
        { }
        <a className="btn-green" href="/api/export?type=vendors">Export Excel</a>
      </div>
      <div className="card overflow-hidden p-0">
        <FilterableTable rows={rows} columns={columns} loading={loading} emptyMessage="No vendors yet. Use “Invite vendor” to send the first link." />
      </div>

      {inviting && (
        <Modal
          title="Invite a vendor"
          subtitle="The vendor gets a private link and verifies their email with a one-time code."
          size="max-w-lg"
          onClose={() => setInviting(false)}
          footer={
            <>
              <button className="btn border border-stone-300 bg-white" onClick={() => setInviting(false)}>Cancel</button>
              <button className="btn-primary disabled:opacity-60" disabled={busy} onClick={() => void sendInvite()}>{busy ? "Creating…" : "Create link"}</button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label="Vendor email" required error={inviteError}>
              <input className={inputClass(Boolean(inviteError))} type="email" inputMode="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="accounts@vendor.com" />
            </Field>
            <Field label="Vendor name (optional)">
              <input className={inputClass()} value={inviteForm.legalName} onChange={(e) => setInviteForm({ ...inviteForm, legalName: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}

      {invite && (
        <Modal title="Vendor link ready" subtitle={invite.email} size="max-w-lg" onClose={() => setInvite(null)} footer={<button className="btn-primary" onClick={() => setInvite(null)}>Done</button>}>
          {invite.emailed ? (
            <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-900">The link was emailed to the vendor. You can also copy it below.</p>
          ) : (
            <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              {invite.emailProblem ?? (invite.emailConfigured ? "" : "Email sending is not set up, so the link was not emailed.")} Copy the link and send it to the vendor yourself.
            </p>
          )}
          <input readOnly className={inputClass(false, "text-xs")} value={invite.link} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn-green mt-3" onClick={() => void copy(invite.link)}>Copy link</button>
          <p className="mt-3 text-xs text-stone-500">The link works for 14 days and stops working once the vendor submits.</p>
        </Modal>
      )}

      {editing && (
        <Modal
          title={editing.legalName || editing.email}
          subtitle={`${editing.email} · ${editing.status === "SUBMITTED" ? "Submitted " + date(editing.submittedAt) : "Not submitted yet"}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn border border-stone-300 bg-white" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary disabled:opacity-60" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save changes"}</button>
            </>
          }
        >
          {!canEditBank && editing.status === "SUBMITTED" && (
            <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Only an Admin, CEO or COO can change bank details. You can view them here.</p>
          )}
          <VendorForm
            values={values}
            errors={errors}
            onChange={(key: VendorFieldKey, value) => { setValues((c) => ({ ...c, [key]: cleanVendorInput(key, value) })); setErrors((c) => ({ ...c, [key]: "" })); }}
            bankReadOnly={!canEditBank}
          />
        </Modal>
      )}
    </>
  );
}
