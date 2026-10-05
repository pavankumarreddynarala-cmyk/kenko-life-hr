"use client";

import { useRouter } from "next/navigation";
import { VendorOtp } from "@/components/vendor-otp";

export function VendorLogin() {
  const router = useRouter();
  return (
    <main className="flex min-h-screen items-center justify-center bg-kenko-cream p-4 sm:p-5">
      <section className="card w-full max-w-md">
        <p className="text-sm font-bold tracking-widest text-kenko-green">THE KENKO LIFE</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Vendor sign in</h1>
        <p className="mt-2 text-sm text-stone-500">Enter the email address you registered with. We will email you a one-time code.</p>
        <VendorOtp onVerified={() => { router.replace("/vendor"); router.refresh(); }} />
      </section>
    </main>
  );
}
