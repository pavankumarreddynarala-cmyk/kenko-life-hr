"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { SessionProvider, SessionUser } from "@/components/session-context";
import { IdleTimeout, LOGOUT_KEY } from "@/components/idle-timeout";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { useToast } from "@/components/toast";
import { SESSION_EXPIRED_EVENT } from "@/lib/client-api";

type NavItem = { label: string; href: string; also?: string[] };

const MANAGEMENT_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Employee Master", href: "/employees" },
  { label: "Asset Register", href: "/assets" },
  { label: "Transfers", href: "/transfers" },
  { label: "Master Data", href: "/masters" },
  { label: "Import / Export", href: "/imports" },
  { label: "Audit Logs", href: "/audit" },
];

const EMPLOYEE_NAV: NavItem[] = [
  { label: "My Profile", href: "/employee", also: ["/employee/employment", "/employee/bank"] },
  { label: "My Assets", href: "/employee/assets" },
  { label: "My Requests", href: "/employee/requests" },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  return (
    <SessionProvider user={user}>
      <ShellFrame user={user}>{children}</ShellFrame>
    </SessionProvider>
  );
}

function ShellFrame({ user, children }: { user: SessionUser; children: ReactNode }) {
  const path = usePathname();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const leaving = useRef(false);
  const management = user.portal === "management";
  const nav = management ? MANAGEMENT_NAV : EMPLOYEE_NAV;
  const loginUrl = management ? "/login" : "/employee/login";

  const leave = useCallback(
    (destination: string) => {
      if (leaving.current) return;
      leaving.current = true;
      window.location.assign(destination);
    },
    [],
  );

  const logout = useCallback(
    async (reason?: "inactivity") => {
      if (leaving.current) return;
      setSigningOut(true);
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
      } catch {
        // Even if the request fails the cookie expires on its own within minutes.
      }
      try {
        window.localStorage.setItem(LOGOUT_KEY, String(Date.now()));
      } catch {
        // Storage may be unavailable; other tabs will still time out on their own.
      }
      leave(reason === "inactivity" ? `${loginUrl}?reason=inactivity` : loginUrl);
    },
    [leave, loginUrl],
  );

  const onIdleTimeout = useCallback(() => void logout("inactivity"), [logout]);

  // A request elsewhere in the page found the session gone (timeout, sign-out in another tab).
  useEffect(() => {
    const onExpired = () => {
      if (leaving.current) return;
      toast.error("Your session has expired, so nothing was saved. Sign in again to continue.", { title: "Signed out" });
      window.setTimeout(() => leave(`${loginUrl}?reason=expired`), 2500);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [leave, loginUrl, toast]);

  // Signing out in one tab signs out every open tab.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === LOGOUT_KEY && event.newValue) leave(loginUrl);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [leave, loginUrl]);

  useEffect(() => setMenuOpen(false), [path]);

  const isActive = (item: NavItem) =>
    path === item.href || Boolean(item.also?.includes(path)) || (item.href !== "/employee" && path.startsWith(`${item.href}/`));

  return (
    <div className="min-h-screen lg:flex">
      {/* Mobile / tablet top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-kenko-ink px-4 py-3 text-white lg:hidden">
        <button aria-label="Open menu" aria-expanded={menuOpen} className="-ml-1 rounded-lg p-2 hover:bg-white/10" onClick={() => setMenuOpen(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="min-w-0 truncate text-base font-bold">
          <span className="text-kenko-orange">THE KENKO</span> LIFE
        </span>
        <button className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-60" disabled={signingOut} onClick={() => void logout()}>
          Logout
        </button>
      </header>

      {menuOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] max-w-[85vw] flex-col bg-kenko-ink px-5 py-6 text-white transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-[245px] lg:max-w-none lg:shrink-0 lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
        aria-label="Main navigation"
      >
        <div className="mb-8 flex items-start justify-between">
          <Link href={(management ? "/dashboard" : "/employee") as Route} className="block text-xl font-bold">
            <span className="text-kenko-orange">THE KENKO</span> LIFE
            <span className="block text-xs font-normal text-stone-300">People &amp; Assets</span>
          </Link>
          <button aria-label="Close menu" className="rounded-lg p-1 text-2xl leading-none text-stone-300 hover:bg-white/10 lg:hidden" onClick={() => setMenuOpen(false)}>
            ×
          </button>
        </div>
        <p className="mb-3 text-xs font-bold tracking-widest text-stone-400">{management ? "MANAGEMENT" : "EMPLOYEE PORTAL"}</p>
        <nav className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href as Route}
              aria-current={isActive(item) ? "page" : undefined}
              className={`block rounded-lg px-3 py-2.5 text-sm ${isActive(item) ? "bg-white/15 text-white" : "text-stone-300 hover:bg-white/10"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Signed-in profile, then Logout directly beneath it */}
        <div className="mt-4 shrink-0 border-t border-white/10 pt-4">
          <p className="mb-2 text-[10px] font-bold tracking-widest text-stone-400">SIGNED IN AS</p>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kenko-orange text-sm font-bold" aria-hidden="true">
              {initials(user.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold" title={user.name}>{user.name}</p>
              <p className="truncate text-xs text-stone-300" title={user.email}>{user.email}</p>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-xs">
            <dt className="text-stone-400">Login type</dt>
            <dd>
              <span className="rounded-full bg-white/15 px-2 py-0.5 font-semibold">{user.roleLabel}</span>
            </dd>
            {user.employeeCode && (
              <>
                <dt className="text-stone-400">Employee ID</dt>
                <dd className="font-semibold">{user.employeeCode}</dd>
              </>
            )}
          </dl>
          {management && (
            <button className="mt-3 w-full rounded-lg border border-white/20 px-3 py-2 text-sm text-stone-200 hover:bg-white/10" onClick={() => setChangingPassword(true)}>
              Change password
            </button>
          )}
          <button
            className="mt-2 w-full rounded-lg bg-red-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            disabled={signingOut}
            onClick={() => void logout()}
          >
            {signingOut ? "Signing out…" : "Logout"}
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="hidden border-b border-stone-200 bg-white px-6 py-4 lg:block">
          <p className="text-xs font-semibold tracking-widest text-kenko-green">{management ? "SECURE WORKSPACE" : "EMPLOYEE PORTAL"}</p>
          <p className="font-semibold">{management ? "HR & ASSET MANAGEMENT" : "MY KENKO WORKSPACE"}</p>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-5 lg:p-8">{children}</main>
      </div>

      {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
      <IdleTimeout onTimeout={onIdleTimeout} />
    </div>
  );
}
