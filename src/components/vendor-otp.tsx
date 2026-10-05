"use client";

import { useState } from "react";
import { Field, inputClass } from "@/components/form";
import { useToast } from "@/components/toast";
import { jsonBody, requestJson } from "@/lib/client-api";

/** Email + one-time code. With `token` (the invitation link) the email is fixed; otherwise the vendor types it. */
export function VendorOtp({ token, email: fixedEmail, onVerified }: { token?: string; email?: string; onVerified: (status: string) => void }) {
  const toast = useToast();
  const [email, setEmail] = useState(fixedEmail ?? "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    if (!token && !email.trim()) return setError("Enter your email address.");
    setBusy(true);
    setError("");
    try {
      const body = await requestJson<{ message: string }>("/api/vendor/otp", jsonBody("POST", { token, email }));
      setSent(true);
      toast.info(body.message, { title: "Code requested" });
    } catch (e) {
      toast.fromError(e, "Could not send the code");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!/^\d{4,8}$/.test(code.trim())) return setError("Enter the numeric code from your email.");
    setBusy(true);
    setError("");
    try {
      const body = await requestJson<{ status: string }>("/api/vendor/otp/verify", jsonBody("POST", { token, email, otp: code.trim() }));
      onVerified(body.status);
    } catch (e) {
      toast.fromError(e, "Could not verify the code");
      setBusy(false);
    }
  }

  return (
    <form className="mt-5 space-y-3" noValidate onSubmit={(event) => { event.preventDefault(); void (sent ? verify() : send()); }}>
      <Field label="Email address" error={!sent ? error : undefined}>
        <input className={inputClass(false, fixedEmail ? "bg-stone-100" : "")} type="email" inputMode="email" autoComplete="email" value={email} readOnly={Boolean(fixedEmail) || sent} onChange={(event) => setEmail(event.target.value)} placeholder="you@yourcompany.com" />
      </Field>
      {sent && (
        <Field label="One-time code" error={error} hint="Enter the code we emailed you. It is valid for a few minutes.">
          <input className={inputClass(Boolean(error))} inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
        </Field>
      )}
      <button className="btn-primary w-full disabled:opacity-60" disabled={busy} type="submit">
        {busy ? "Please wait…" : sent ? "Verify and continue" : "Send me a code"}
      </button>
      {sent && (
        <button className="w-full text-sm text-stone-600 underline" type="button" disabled={busy} onClick={() => { setSent(false); setCode(""); setError(""); }}>
          Send a new code
        </button>
      )}
    </form>
  );
}
