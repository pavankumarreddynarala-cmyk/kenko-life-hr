"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputClass, RequiredLegend } from "@/components/form";
import { useToast } from "@/components/toast";
import { fieldErrorMap, jsonBody, requestJson } from "@/lib/client-api";
import { describeMissing, requiredErrors, type FormErrors } from "@/lib/form-validation";

const LABELS = { email: "Email", password: "Password" };

const REASONS: Record<string, string> = {
  inactivity: "You were signed out automatically after 5 minutes of inactivity. Sign in again to continue.",
  expired: "Your session has ended. Sign in again to continue.",
};

export function LoginForm({ reason }: { reason?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (reason && REASONS[reason]) toast.info(REASONS[reason], { title: "Signed out" });
    // Only announce the reason once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  }

  async function submit() {
    const missing = requiredErrors(form, ["email", "password"], LABELS);
    if (Object.keys(missing).length) {
      setErrors(missing);
      toast.error(`Fill in the required fields before signing in: ${describeMissing(missing, LABELS)}.`, { title: "Cannot sign in yet" });
      return;
    }
    setBusy(true);
    try {
      const body = await requestJson<{ redirectTo: string }>("/api/auth/login", jsonBody("POST", form));
      router.replace(body.redirectTo as "/dashboard");
      router.refresh();
    } catch (error) {
      setErrors(fieldErrorMap(error));
      toast.fromError(error, "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-kenko-cream p-4 sm:p-5">
      <section className="card w-full max-w-md">
        <p className="text-sm font-bold tracking-widest text-kenko-green">THE KENKO LIFE</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Management sign in</h1>
        <p className="mt-2 text-sm text-stone-500">Secure access for Admin, CEO, COO, HR and CFO.</p>
        <form
          className="mt-6 space-y-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <RequiredLegend />
          <Field label={LABELS.email} required error={errors.email}>
            <input autoComplete="username" className={inputClass(Boolean(errors.email))} inputMode="email" value={form.email} onChange={(event) => set("email", event.target.value)} placeholder="you@thekenkolife.com" type="email" />
          </Field>
          <Field label={LABELS.password} required error={errors.password}>
            <input autoComplete="current-password" className={inputClass(Boolean(errors.password))} value={form.password} type="password" onChange={(event) => set("password", event.target.value)} placeholder="Password" />
          </Field>
          <button className="btn-primary w-full disabled:opacity-60" disabled={busy} type="submit">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
