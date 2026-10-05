"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { VendorForm, cleanVendorInput, vendorErrors, type VendorErrors, type VendorValues } from "@/components/vendor-form";
import { VendorOtp } from "@/components/vendor-otp";
import { describeMissing } from "@/lib/form-validation";
import { fieldErrorMap, jsonBody, requestJson } from "@/lib/client-api";
import { VENDOR_LABELS, type VendorFieldKey } from "@/lib/vendor-fields";

type Stage = "checking" | "invalid" | "otp" | "form" | "done";

export function VendorApply({ token }: { token: string }) {
  const toast = useToast();
  const [stage, setStage] = useState<Stage>("checking");
  const [problem, setProblem] = useState("");
  const [email, setEmail] = useState("");
  const [values, setValues] = useState<VendorValues>({});
  const [errors, setErrors] = useState<VendorErrors>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    requestJson<{ email: string; legalName?: string | null }>(`/api/vendor/invite/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((body) => {
        setEmail(body.email);
        if (body.legalName) setValues({ legalName: body.legalName });
        setStage("otp");
      })
      .catch((error: unknown) => {
        setProblem(error instanceof Error ? error.message : "This link could not be opened.");
        setStage("invalid");
      });
  }, [token]);

  function change(key: VendorFieldKey, value: string) {
    setValues((current) => ({ ...current, [key]: cleanVendorInput(key, value) }));
    setErrors((current) => ({ ...current, [key]: "" }));
  }

  async function submit() {
    const found = vendorErrors(values, { includeBank: true });
    if (Object.keys(found).length) {
      setErrors(found);
      toast.error(`Please correct: ${describeMissing(found, VENDOR_LABELS)}.`, { title: "Details not submitted" });
      return;
    }
    setBusy(true);
    try {
      await requestJson("/api/vendor/me", jsonBody("POST", values));
      setStage("done");
    } catch (error) {
      setErrors(fieldErrorMap(error));
      toast.fromError(error, "Details not submitted");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-kenko-cream px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-sm font-bold tracking-widest text-kenko-green">THE KENKO LIFE</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Vendor registration</h1>

        {stage === "checking" && <section className="card mt-5 text-sm text-stone-600">Checking your link…</section>}

        {stage === "invalid" && (
          <section className="card mt-5">
            <p className="font-semibold text-red-700">{problem}</p>
            <a className="btn-primary mt-4 inline-block" href="/vendor/login">Already registered? Sign in</a>
          </section>
        )}

        {stage === "otp" && (
          <section className="card mt-5 max-w-md">
            <p className="text-sm text-stone-600">We will send a one-time code to the email address this link was issued for. Enter it to continue.</p>
            <VendorOtp token={token} email={email} onVerified={() => setStage("form")} />
          </section>
        )}

        {stage === "form" && (
          <form className="card mt-5" noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <p className="mb-4 text-sm text-stone-600">Fill in your details. <strong>Check your bank details carefully</strong>: after you submit, only The Kenko Life can change them.</p>
            <VendorForm values={values} errors={errors} onChange={change} />
            <button className="btn-primary mt-6 w-full disabled:opacity-60 sm:w-auto" disabled={busy} type="submit">{busy ? "Submitting…" : "Submit details"}</button>
          </form>
        )}

        {stage === "done" && (
          <section className="card mt-5">
            <h2 className="text-xl font-bold text-kenko-green">Thank you</h2>
            <p className="mt-2 text-sm text-stone-600">Your details have been submitted. You can sign in any time with your email to view them.</p>
            <a className="btn-primary mt-4 inline-block" href="/vendor">View my details</a>
          </section>
        )}
      </div>
    </main>
  );
}
