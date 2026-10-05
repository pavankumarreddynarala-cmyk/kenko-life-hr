"use client";

import { useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/shell";

type LoginRow = { id: string; email: string; role: string; createdAt: string };

export default function LoginsPage() {
  const [rows, setRows] = useState<LoginRow[]>([]);
  const [form, setForm] = useState({ email: "", password: "", role: "HR" });
  const [reset, setReset] = useState<{ id: string; password: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/users", { cache: "no-store" });
    if (response.status === 403) setForbidden(true);
    else setRows((await response.json()).data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => void load(), [load]);

  async function create() {
    setNotice("");
    const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = await response.json();
    if (!response.ok) return setNotice(body.error ?? "Unable to create login");
    setForm({ email: "", password: "", role: "HR" });
    setNotice(`Login created for ${body.data.email}. Share the password with them securely.`);
    await load();
  }

  async function doReset() {
    if (!reset) return;
    const response = await fetch(`/api/users/${reset.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: reset.password }) });
    const body = await response.json();
    if (!response.ok) return setNotice(body.error ?? "Unable to reset password");
    setReset(null);
    setNotice("Password reset. Share the new password with the user securely.");
  }

  if (forbidden) return <Shell><p className="card text-sm">Only the administrator account that controls logins can open this page.</p></Shell>;

  return (
    <Shell>
      <div className="mb-6">
        <p className="text-xs font-bold tracking-widest text-kenko-green">ACCESS CONTROL</p>
        <h2 className="text-2xl font-bold">Logins</h2>
        <p className="text-sm text-stone-500">Create and reset management logins. You supply the email and password for each user.</p>
      </div>
      <section className="card mb-5">
        <h3 className="font-bold">Create login</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-[1.4fr_1.4fr_160px_auto]">
          <input autoComplete="off" className="input" inputMode="email" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input autoComplete="new-password" className="input" placeholder="Password (min 10 characters)" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="ADMIN">Admin</option>
            <option value="HR">HR</option>
            <option value="CFO">CFO</option>
          </select>
          <button className="btn-primary" onClick={create}>Create</button>
        </div>
      </section>
      <section className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-max min-w-full">
            <thead><tr><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Password</th></tr></thead>
            <tbody>
              {loading && <tr><td className="px-4 py-8 text-center text-stone-500" colSpan={4}>Loading…</td></tr>}
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">{row.email}</td>
                  <td className="px-4 py-3">{row.role}</td>
                  <td className="px-4 py-3">{new Date(row.createdAt).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-3">
                    {reset?.id === row.id ? (
                      <span className="flex flex-wrap gap-2">
                        <input autoComplete="new-password" className="input w-56" placeholder="New password" value={reset.password} onChange={(e) => setReset({ id: row.id, password: e.target.value })} />
                        <button className="btn-primary" onClick={doReset}>Save</button>
                        <button className="btn" onClick={() => setReset(null)}>Cancel</button>
                      </span>
                    ) : (
                      <button className="rounded-md bg-stone-100 px-2 py-1 text-kenko-green" onClick={() => setReset({ id: row.id, password: "" })}>Reset</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {notice && <p className="mt-4 rounded-lg bg-orange-50 p-3 text-sm text-orange-900">{notice}</p>}
    </Shell>
  );
}
