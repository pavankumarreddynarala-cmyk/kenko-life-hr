"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { VendorForm, cleanVendorInput, vendorErrors, type VendorErrors, type VendorValues } from "@/components/vendor-form";
import { describeMissing } from "@/lib/form-validation";
import { fieldErrorMap, jsonBody, requestJson } from "@/lib/client-api";
import { VENDOR_FIELDS, VENDOR_LABELS, VENDOR_SECTIONS } from "@/lib/vendor-fields";

type Vendor = VendorValues & { email: string; status: string; submittedAt: string | null };

export function VendorHome() {
  const router = useRouter();
  const toast = useToast();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [support, setSupport] = useState("accounts@thekenkolife.com");
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<VendorValues>({});
  const [errors, setErrors] = useState<VendorErrors>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const body = await requestJson<{ data: Vendor; supportEmail: string }>("/api/vendor/me", { cache: "no-store" });
      setVendor(body.data);
      setSupport(body.supportEmail);
    } catch (error) {
      toast.fromError(error, "Could not load your details");
      router.replace("/vendor/login");
    }
  }, [router, toast]);
  useEffect(() => void load(), [load]);

  async function signOut() {
    await fetch("/api/vendor/logout", { method: "POST" });
    router.replace("/vendor/login");
    router.refresh();
  }

  async function save() {
    const found = vendorErrors(values, { includeBank: false });
    if (Object.keys(found).length) {
      setErrors(found);
      toast.error(`Please correct: ${describeMissing(found, VENDOR_LABELS)}.`, { title: "Not saved" });
      return;
    }
    setBusy(true);
    try {
      const body = await requestJson<{ data: Vendor }>("/api/vendor/me", jsonBody("PATCH", values));
      setVendor(body.data);
      setEditing(false);
      toast.success("Your details were updated.", { title: "Saved" });
    } catch (error) {
      setErrors(fieldErrorMap(error));
      toast.fromError(error, "Not saved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-kenko-cream px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold tracking-widest text-kenko-green">THE KENKO LIFE</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">My vendor details</h1>
            {vendor && <p className="text-sm text-stone-500">{vendor.email}</p>}
          </div>
          <button className="btn border border-stone-300 bg-white" onClick={() => void signOut()}>Sign out</button>
        </div>

        {!vendor ? (
          <section className="card mt-5 text-sm text-stone-600">Loading…</section>
        ) : vendor.status !== "SUBMITTED" ? (
          <section className="card mt-5 text-sm text-stone-600">Your details have not been submitted yet. Open the link you were sent to complete registration.</section>
        ) : editing ? (
          <form className="card mt-5" noValidate onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <VendorForm values={values} errors={errors} onChange={(key, value) => { setValues((c) => ({ ...c, [key]: cleanVendorInput(key, value) })); setErrors((c) => ({ ...c, [key]: "" })); }} bankReadOnly />
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="btn-primary disabled:opacity-60" disabled={busy} type="submit">{busy ? "Saving…" : "Save changes"}</button>
              <button className="btn border border-stone-300 bg-white" type="button" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <section className="mt-5 space-y-4">
            {VENDOR_SECTIONS.map((section) => (
              <div key={section.title} className="card">
                <h2 className="text-sm font-bold text-kenko-green">{section.title}</h2>
                <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {section.fields.map((field) => (
                    <div key={field.key}>
                      <dt className="text-xs text-stone-500">{field.label}</dt>
                      <dd className="break-words text-sm font-medium">{String(vendor[field.key] ?? "") || "—"}</dd>
                    </div>
                  ))}
                </dl>
                {section.title === "Bank details" && <p className="mt-3 text-xs text-stone-500">Bank details cannot be edited here. To change them write to {support}.</p>}
              </div>
            ))}
            <button className="btn-primary" onClick={() => { setValues(Object.fromEntries(VENDOR_FIELDS.map((f) => [f.key, vendor[f.key] ?? ""]))); setErrors({}); setEditing(true); }}>Edit details</button>
          </section>
        )}
      </div>
    </main>
  );
}
