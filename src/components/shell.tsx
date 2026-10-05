"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const baseNav = [["Dashboard", "/"], ["Employee Master", "/employees"], ["Asset Register", "/assets"], ["Depreciation Setup", "/depreciation-setup"], ["Transfers", "/transfers"], ["Master Data", "/masters"], ["Import / Export", "/imports"], ["Audit Logs", "/audit"], ["Employee Portal", "/employee"]] as const;

type Me = { email: string; role: string; canManageLogins: boolean };

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
      if (!live) return;
      if (!response.ok) return router.replace("/login");
      const value = (await response.json()) as Me;
      if (value.role === "EMPLOYEE") return router.replace("/employee");
      setMe(value);
    });
    return () => { live = false; };
  }, [router]);

  useEffect(() => setMenuOpen(false), [path]);

  const nav = me?.canManageLogins ? [...baseNav.slice(0, -1), ["Logins", "/users"] as const, baseNav[baseNav.length - 1]] : baseNav;

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[245px_1fr]">
      <aside className="bg-kenko-ink px-5 py-4 text-white lg:py-7">
        <div className="flex items-center justify-between">
          <Link href="/" className="block text-xl font-bold lg:mb-10">
            <span className="text-kenko-orange">THE KENKO</span> LIFE <span className="block text-xs font-normal text-stone-300">People & Assets</span>
          </Link>
          <button aria-expanded={menuOpen} aria-label="Toggle menu" className="rounded-lg border border-white/30 px-3 py-2 text-sm lg:hidden" onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? "Close" : "Menu"}
          </button>
        </div>
        <div className={`${menuOpen ? "block" : "hidden"} mt-5 lg:mt-0 lg:block`}>
          <p className="mb-3 text-xs font-bold tracking-widest text-stone-400">MANAGEMENT</p>
          <nav className="space-y-1">
            {nav.map(([label, href]) => (
              <Link key={href} href={href} className={`block rounded-lg px-3 py-2.5 text-sm ${path === href ? "bg-white/15 text-white" : "text-stone-300 hover:bg-white/10"}`}>{label}</Link>
            ))}
          </nav>
        </div>
      </aside>
      <main className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div>
            <p className="text-xs font-semibold tracking-widest text-kenko-green">SECURE WORKSPACE</p>
            <h1 className="text-sm font-semibold sm:text-base">HR & ASSET MANAGEMENT</h1>
          </div>
          <div className="flex items-center gap-2">
            {me && <span className="hidden text-xs text-stone-500 sm:inline">{me.email}</span>}
            <a href="/employee" className="rounded-full bg-orange-50 px-3 py-1 text-sm font-medium text-kenko-orange">Employee Portal</a>
            <button className="rounded-full bg-stone-100 px-3 py-1 text-sm" onClick={signOut}>Sign out</button>
          </div>
        </header>
        <div className="p-4 sm:p-5 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
