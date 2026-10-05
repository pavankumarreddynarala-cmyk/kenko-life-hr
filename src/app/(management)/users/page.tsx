"use client";

import { useCallback, useEffect, useState } from "react";
import { Field, inputClass, Modal } from "@/components/form";
import { useSessionUser } from "@/components/session-context";
import { useToast } from "@/components/toast";
import { fieldErrorMap, jsonBody, requestJson } from "@/lib/client-api";

type LoginRow = { id: string; name?: string | null; email: string; role: string; createdAt: string };
const ROLES = [
  ["ADMIN", "Admin"],
  ["CEO", "CEO"],
  ["COO", "COO"],
  ["HR", "HR"],
  ["CFO", "CFO"],
] as const;

// R1: only the main administrator account sees this page; the server rejects everyone else.
export default function LoginsPage() {
  const user = useSessionUser();
  const toast = useToast();
  const [rows, setRows] = useState<LoginRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "HR" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [reset, setReset] = useState<{ row: LoginRow; password: string; error: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setRows((await requestJson<{ data: LoginRow[] }>("/api/users", { cache: "no-store" })).data ?? []);
    } catch (error) {
      toast.fromError(error, "Logins could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user.canManageLogins) void load();
    else setLoading(false);
  }, [load, user.canManageLogins]);

  if (!user.canManageLogins) {
    return (
      <p className="card text-sm">
        Only the main administrator account can create or reset logins. Ask them to do it for you.
      </p>
    );
  }

  async function create() {
    setSaving(true);
    setErrors({});
    try {
      const body = await requestJson<{ data: LoginRow }>("/api/users", jsonBody("POST", form));
      setForm({ name: "", email: "", password: "", role: "HR" });
      toast.success(`Login created for ${body.data.email}. Share the password with them securely.`, { title: "Login created" });
      await load();
    } catch (error) {
      setErrors(fieldErrorMap(error));
      toast.fromError(error, "Login not created");
    } finally {
      setSaving(false);
    }
  }

  async function doReset() {
    if (!reset) return;
    setSaving(true);
    try {
      await requestJson(`/api/users/${reset.row.id}`, jsonBody("PATCH", { password: reset.password }));
      toast.success(`Password changed for ${reset.row.email}. Share the new password with them securely.`, { title: "Password reset" });
      setReset(null);
    } catch (error) {
      setReset({ ...reset, error: fieldErrorMap(error).password ?? (error instanceof Error ? error.message : "Could not reset the password.") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mb-6">
        <p className="text-xs font-bold tracking-widest text-kenko-green">ACCESS CONTROL</p>
        <h2 className="text-2xl font-bold">Logins</h2>
        <p className="text-sm text-stone-500">Create and reset management logins. You supply the email and password for each person.</p>
      </div>

      <section className="card mb-5">
        <h3 className="font-bold">Create login</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.3fr_1.3fr_150px_auto] lg:items-start">
          <Field label="Name" error={errors.name}>
            <input className={inputClass(Boolean(errors.name))} value={form.name} autoComplete="off" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Email" required error={errors.email}>
            <input className={inputClass(Boolean(errors.email))} type="email" inputMode="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Password" required error={errors.password} hint="At least 10 characters">
            <input className={inputClass(Boolean(errors.password))} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="Role" required error={errors.role}>
            <select className={inputClass(Boolean(errors.role))} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2 lg:col-span-1 lg:pt-6">
            <button className="btn-primary w-full" disabled={saving} onClick={() => void create()}>{saving ? "Saving…" : "Create"}</button>
          </div>
        </div>
      </section>

      <section className="card overflow-hidden p-0">
        <div className="max-w-full overflow-x-auto">
          <table className="w-max min-w-full">
            <thead>
              <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Password</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td className="px-4 py-8 text-center text-stone-500" colSpan={5}>Loading…</td></tr>}
              {!loading && !rows.length && <tr><td className="px-4 py-8 text-center text-stone-500" colSpan={5}>No logins yet.</td></tr>}
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">{row.name || "—"}</td>
                  <td className="px-4 py-3">{row.email}</td>
                  <td className="px-4 py-3">{row.role}</td>
                  <td className="px-4 py-3">{new Date(row.createdAt).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-3">
                    <button className="rounded-md bg-stone-100 px-2 py-1 text-kenko-green" onClick={() => setReset({ row, password: "", error: "" })}>Reset</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {reset && (
        <Modal
          title="Reset password"
          subtitle={reset.row.email}
          size="max-w-md"
          onClose={() => setReset(null)}
          footer={
            <>
              <button className="btn" onClick={() => setReset(null)}>Cancel</button>
              <button className="btn-primary" disabled={saving} onClick={() => void doReset()}>{saving ? "Saving…" : "Save password"}</button>
            </>
          }
        >
          <Field label="New password" required error={reset.error} hint="At least 10 characters">
            <input className={inputClass(Boolean(reset.error))} autoComplete="new-password" value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value, error: "" })} />
          </Field>
        </Modal>
      )}
    </>
  );
}
