"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionUser } from "@/components/session-context";
import { useToast } from "@/components/toast";
import { requestJson } from "@/lib/client-api";
import type { DashboardData } from "@/lib/dashboard";

const REFRESH_MS = 60_000;

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function timeAgo(iso: string, now: number) {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

const DOT = { success: "bg-kenko-green", warning: "bg-kenko-orange", info: "bg-stone-400" } as const;

export default function Dashboard() {
  const user = useSessionUser();
  const toast = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [hour, setHour] = useState<number | null>(null);
  const failing = useRef(false);

  const load = useCallback(async () => {
    try {
      const body = await requestJson<{ data: DashboardData }>("/api/dashboard", { cache: "no-store" });
      setData(body.data);
      setNow(Date.now());
      failing.current = false;
    } catch (error) {
      // Tell the user once, not on every refresh while the problem lasts.
      if (!failing.current) toast.fromError(error, "Dashboard could not be refreshed");
      failing.current = true;
    }
  }, [toast]);

  useEffect(() => {
    setHour(new Date().getHours());
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const firstName = user.name.split(" ")[0];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-7">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold sm:text-3xl">
            {hour === null ? "Welcome" : greeting(hour)}, {firstName}
          </h2>
          <p className="mt-1 text-stone-500">A live view of your people and capital assets.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-primary" href="/employees?new=1">+ Add Employee</Link>
          <Link className="btn-green" href="/assets?new=1">+ Add Asset</Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(data?.metrics ?? Array.from({ length: 8 }, () => null)).map((metric, index) =>
          metric ? (
            <Link href={metric.href as Route} className="card block transition hover:border-kenko-orange" key={metric.key}>
              <p className="text-sm text-stone-500">{metric.label}</p>
              <p className={`mt-3 break-words text-2xl font-bold sm:text-3xl ${metric.tone === "attention" ? "text-kenko-orange" : ""}`}>{metric.value}</p>
              <p className="mt-1 text-xs text-kenko-green">{metric.note}</p>
            </Link>
          ) : (
            <div className="card" key={index} aria-hidden="true">
              <div className="h-4 w-24 animate-pulse rounded bg-stone-100" />
              <div className="mt-4 h-8 w-20 animate-pulse rounded bg-stone-100" />
              <div className="mt-3 h-3 w-32 animate-pulse rounded bg-stone-100" />
            </div>
          ),
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <section className="card min-w-0">
          <h3 className="font-bold">Recent activity</h3>
          <div className="mt-4 space-y-4">
            {!data && <p className="text-sm text-stone-400">Loading…</p>}
            {data && data.activity.length === 0 && <p className="text-sm text-stone-500">No activity has been recorded yet.</p>}
            {data?.activity.map((item) => (
              <div className="flex gap-3" key={item.id}>
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[item.tone]}`} />
                <p className="min-w-0 break-words text-sm">
                  <span className="font-semibold">{item.actor}</span> {item.text}
                  <span className="ml-2 whitespace-nowrap text-xs text-stone-400" title={new Date(item.at).toLocaleString("en-IN")}>
                    {timeAgo(item.at, now)}
                  </span>
                </p>
              </div>
            ))}
          </div>
          <Link className="mt-5 inline-block text-sm text-kenko-green underline" href="/audit">View full audit log</Link>
        </section>

        <section className="card min-w-0">
          <h3 className="font-bold">Important alerts</h3>
          <div className="mt-4 space-y-3">
            {!data && <p className="text-sm text-stone-400">Loading…</p>}
            {data && data.alerts.length === 0 && (
              <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900">Nothing needs attention right now.</p>
            )}
            {data?.alerts.map((alert) => {
              const style = alert.severity === "warning" ? "bg-orange-50 text-orange-900" : "bg-green-50 text-green-900";
              return alert.href ? (
                <Link href={alert.href as Route} className={`block rounded-lg p-3 text-sm hover:opacity-90 ${style}`} key={alert.id}>
                  {alert.message}
                </Link>
              ) : (
                <p className={`rounded-lg p-3 text-sm ${style}`} key={alert.id}>{alert.message}</p>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
