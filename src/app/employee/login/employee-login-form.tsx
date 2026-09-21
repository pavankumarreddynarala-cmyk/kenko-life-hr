"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputClass, RequiredLegend } from "@/components/form";
import { useToast } from "@/components/toast";
import { fieldErrorMap, jsonBody, requestJson } from "@/lib/client-api";
import { describeMissing, requiredErrors, type FormErrors } from "@/lib/form-validation";
import { FIELD_LABELS } from "@/lib/field-labels";
import { INDIAN_STATES_AND_UTS } from "@/lib/validators";

const REASONS: Record<string, string> = {
  inactivity: "You were signed out automatically after 5 minutes of inactivity. Sign in again to continue.",
  expired: "Your session has ended. Sign in again to continue.",
};

// Everything except Address line 2 is mandatory at onboarding.
const ONBOARDING_FIELDS = [
  ["name", "Name as per PAN card", "text", true],
  ["dateOfBirth", "Date of birth", "date", true],
  ["phone", "Mobile number", "tel", true],
  ["pan", "PAN number", "text", true],
  ["aadhaar", "Aadhaar number", "text", true],
  ["address1", "Address line 1", "text", true],
  ["address2", "Address line 2", "text", false],
  ["pinCode", "PIN code", "text", true],
] as const;
const ONBOARDING_REQUIRED = [...ONBOARDING_FIELDS.filter((field) => field[3]).map((field) => field[0]), "state"];
const ONBOARDING_LABELS: Record<string, string> = {
  ...FIELD_LABELS,
  ...Object.fromEntries(ONBOARDING_FIELDS.map(([key, label]) => [key, label])),
  state: "State / Union Territory",
};

type Stage = "email" | "otp" | "onboarding";

export function EmployeeLoginForm({ reason }: { reason?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | "onboarding" | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [form, setForm] = useState<Record<string, string>>({
    email: "",
    name: "",
    dateOfBirth: "",
    phone: "",
    pan: "",
    aadhaar: "",
    address1: "",
    address2: "",
    pinCode: "",
    state: "",
  });

  useEffect(() => {
    if (reason && REASONS[reason]) toast.info(REASONS[reason], { title: "Signed out" });
    // Only announce the reason once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clear(key: string) {
    setErrors((current) => ({ ...current, [key]: "" }));
  }

  async function send() {
    const missing = requiredErrors({ email }, ["email"], { email: "Email ID" });
    if (missing.email) {
      setErrors(missing);
      toast.error("Enter your email ID to receive a one-time code.", { title: "Cannot send OTP yet" });
      return;
    }
    setBusy("send");
    try {
      const body = await requestJson<{ message: string; email: string }>("/api/otp", jsonBody("POST", { email }));
      setEmail(body.email);
      setStage("otp");
      toast.info(body.message, { title: "OTP sent" });
    } catch (error) {
      setErrors(fieldErrorMap(error));
      toast.fromError(error, "Could not send the OTP");
    } finally {
      setBusy(null);
    }
  }

  async function verify() {
    const missing = requiredErrors({ otp }, ["otp"], { otp: "OTP" });
    if (missing.otp) {
      setErrors(missing);
      toast.error("Enter the one-time code that was sent to your email.", { title: "Cannot verify yet" });
      return;
    }
    setBusy("verify");
    try {
      const body = await requestJson<{ isNew: boolean; email: string }>("/api/otp/verify", jsonBody("POST", { email, otp }));
      setEmail(body.email);
      if (body.isNew) {
        setForm((current) => ({ ...current, email: body.email }));
        setStage("onboarding");
        toast.success("Email verified. Complete your employee profile to continue.", { title: "Welcome" });
      } else {
        router.replace("/employee");
        router.refresh();
      }
    } catch (error) {
      toast.fromError(error, "Could not verify the OTP");
    } finally {
      setBusy(null);
    }
  }

  async function saveOnboarding() {
    const missing = requiredErrors(form, ONBOARDING_REQUIRED, ONBOARDING_LABELS);
    if (Object.keys(missing).length) {
      setErrors(missing);
      toast.error(`Fill in the required fields before continuing: ${describeMissing(missing, ONBOARDING_LABELS)}.`, {
        title: "Onboarding not saved",
      });
      return;
    }
    setBusy("onboarding");
    try {
      const body = await requestJson<{ employee: { permanentId: string } }>("/api/employee/self", jsonBody("POST", form));
      toast.success(`Your Employee ID is ${body.employee.permanentId}.`, { title: "Welcome to The Kenko Life" });
      router.replace("/employee");
      router.refresh();
    } catch (error) {
      setErrors(fieldErrorMap(error));
      toast.fromError(error, "Onboarding not saved");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-kenko-cream p-4 sm:p-5">
      <div className="card mx-auto mt-6 max-w-2xl sm:mt-12">
        <p className="text-sm font-bold tracking-widest text-kenko-green">THE KENKO LIFE</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Employee sign in</h1>
        <p className="mt-2 text-sm text-stone-500">Secure email OTP sign-in and employee onboarding.</p>

        {stage === "email" && (
          <form
            className="mt-6 space-y-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <RequiredLegend />
            <Field label="Email ID" required error={errors.email} hint="We'll email a one-time code to verify it's you.">
              <input
                autoComplete="email"
                className={inputClass(Boolean(errors.email))}
                inputMode="email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  clear("email");
                }}
                placeholder="you@company.com"
              />
            </Field>
            <button className="btn-primary w-full disabled:opacity-60" disabled={busy !== null} type="submit">
              {busy === "send" ? "Sending…" : "Send OTP"}
            </button>
          </form>
        )}

        {stage === "otp" && (
          <form
            className="mt-6 space-y-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void verify();
            }}
          >
            <RequiredLegend />
            <p className="text-sm text-stone-600">Enter the code sent to <strong className="break-all">{email}</strong>.</p>
            <Field label="OTP" required error={errors.otp}>
              <input
                autoComplete="one-time-code"
                className={inputClass(Boolean(errors.otp))}
                inputMode="numeric"
                value={otp}
                onChange={(event) => {
                  setOtp(event.target.value);
                  clear("otp");
                }}
                placeholder="Enter OTP"
              />
            </Field>
            <button className="btn-primary w-full disabled:opacity-60" disabled={busy !== null} type="submit">
              {busy === "verify" ? "Verifying…" : "Verify securely"}
            </button>
            <button className="w-full text-sm text-stone-500 underline" type="button" onClick={() => setStage("email")}>
              Use another email
            </button>
          </form>
        )}

        {stage === "onboarding" && (
          <form
            className="mt-6 grid gap-3 sm:grid-cols-2"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void saveOnboarding();
            }}
          >
            <div className="sm:col-span-2">
              <RequiredLegend />
            </div>
            {ONBOARDING_FIELDS.map(([key, label, type, required]) => (
              <Field key={key} label={label} required={required} error={errors[key]}>
                <input
                  className={inputClass(Boolean(errors[key]))}
                  type={type}
                  value={form[key] ?? ""}
                  onChange={(event) => {
                    setForm({ ...form, [key]: event.target.value });
                    clear(key);
                  }}
                />
              </Field>
            ))}
            <Field label="State / Union Territory" required error={errors.state} className="sm:col-span-2">
              <select
                className={inputClass(Boolean(errors.state))}
                value={form.state}
                onChange={(event) => {
                  setForm({ ...form, state: event.target.value });
                  clear("state");
                }}
              >
                <option value="">Select state or UT</option>
                {INDIAN_STATES_AND_UTS.map((state) => <option key={state}>{state}</option>)}
              </select>
            </Field>
            <button className="btn-primary sm:col-span-2 disabled:opacity-60" disabled={busy !== null} type="submit">
              {busy === "onboarding" ? "Saving…" : "Complete onboarding"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
