"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit() {
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (response.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    setError((await response.json()).error);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-kenko-cream p-5">
      <section className="card w-full max-w-md">
        <p className="text-sm font-bold tracking-widest text-kenko-green">THE KENKO LIFE</p>
        <h1 className="mt-2 text-3xl font-bold">Management sign in</h1>
        <p className="mt-2 text-sm text-stone-500">Secure access for HR, CFO, and administrators.</p>
        <div className="mt-6 space-y-3">
          <input autoComplete="username" className="input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" type="email" />
          <input autoComplete="current-password" className="input" value={password} type="password" onChange={(event) => setPassword(event.target.value)} placeholder="Password" />
          <button className="btn-primary w-full" onClick={submit}>Sign in</button>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
      </section>
    </main>
  );
}
