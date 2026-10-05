"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";

type Data = {
  employees: number; activeEmployees: number; joinedRecently: number; assets: number; assigned: number; pendingTransfers: number;
  exitedHolding: number; notVerified: number; noCapDate: number; unverifiedMasters: number;
  activity: { id: string; action: string; module: string; recordType: string; email: string | null; createdAt: string }[];
};

const words = (s: string) => s.toLowerCase().replace(/_/g, " ");
const ago = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  return new Date(iso).toLocaleDateString("en-IN");
};

export default function Dashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch("/api/dashboard", { cache: "no-store" }).then(async (r) => {
      if (r.ok) setData(await r.json());
      else if (r.status !== 401) setError("Unable to load the dashboard.");
    });
  }, []);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const n = (v?: number) => (data ? String(v ?? 0) : "…");
  const metrics = [
    ["Total employees", n(data?.employees), data ? `${data.activeEmployees} active · ${data.joinedRecently} added in 30 days` : ""],
    ["Active assets", n(data?.assets), data ? `${data.assigned} assigned` : ""],
    ["Pending transfers", n(data?.pendingTransfers), data ? (data.pendingTransfers ? "Requires action" : "Nothing waiting") : ""],
    ["Exit clearances", n(data?.exitedHolding), data ? (data.exitedHolding ? "Exited staff still hold assets" : "No assets held by exited staff") : ""],
  ];
  const alerts: [string, boolean][] = data
    ? [
        [`${data.exitedHolding} exited employee${data.exitedHolding === 1 ? "" : "s"} still hold assets.`, data.exitedHolding > 0],
        [`${data.notVerified} asset${data.notVerified === 1 ? " has" : "s have"} not been physically verified in the last 12 months.`, data.notVerified > 0],
        [`${data.noCapDate} asset${data.noCapDate === 1 ? " has" : "s have"} no capitalisation date, so depreciation is skipped.`, data.noCapDate > 0],
        [`${data.unverifiedMasters} depreciation setup row${data.unverifiedMasters === 1 ? " is" : "s are"} still marked "to verify".`, data.unverifiedMasters > 0],
      ]
    : [];
  const active = alerts.filter(([, on]) => on);
  return (
    <Shell>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold sm:text-3xl">{greeting}</h2>
          <p className="mt-1 text-stone-500">A clear view of your people and capital assets.</p>
        </div>
        <a className="btn-primary" href="/employees">Manage employees</a>
      </div>
      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, note], i) => (
          <div className="card" key={label}>
            <p className="text-sm text-stone-500">{label}</p>
            <p className={`mt-3 text-3xl font-bold ${i === 3 && value !== "0" && value !== "…" ? "text-kenko-orange" : ""}`}>{value}</p>
            <p className="mt-1 text-xs text-kenko-green">{note}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <section className="card">
          <h3 className="font-bold">Recent activity</h3>
          <div className="mt-4 space-y-4">
            {data && !data.activity.length && <p className="text-sm text-stone-500">No activity yet.</p>}
            {data?.activity.map((a, i) => (
              <div className="flex gap-3" key={a.id}>
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${i === 0 ? "bg-kenko-green" : "bg-kenko-orange"}`} />
                <p className="min-w-0 text-sm">
                  <span className="capitalize">{words(a.action)}</span> · {a.recordType}
                  {a.email ? <span className="text-stone-500"> by {a.email}</span> : null}
                  <span className="ml-2 text-xs text-stone-400">{ago(a.createdAt)}</span>
                </p>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <h3 className="font-bold">Important alerts</h3>
          <div className="mt-4 space-y-3">
            {data && !active.length && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900">Nothing needs attention right now.</p>}
            {active.map(([text], i) => <p className={`rounded-lg p-3 text-sm ${i === 0 ? "bg-orange-50 text-orange-900" : "bg-green-50 text-green-900"}`} key={text}>{text}</p>)}
          </div>
        </section>
      </div>
    </Shell>
  );
}
