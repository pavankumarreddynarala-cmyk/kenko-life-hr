import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { readSessionToken } from "@/lib/auth";
import { loadAssetForScan, tokenFromScan, viewerFor } from "@/lib/asset-view";

export const dynamic = "force-dynamic"; // always the live record

// Opened when a QR code is read by a phone's own camera app (the in-portal scanner uses /api/qr-scan).
// Admin, CEO and COO see every group; everyone else signed in sees Group 1, Group 2 and the custodian. No session, no data.
export default async function AssetQrPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = tokenFromScan(raw);
  if (!token) return notFound();
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get("kenko_session")?.value);
  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-kenko-cream p-4">
        <section className="card w-full max-w-md text-center">
          <p className="text-xs font-bold tracking-widest text-kenko-green">THE KENKO LIFE · ASSET REGISTER</p>
          <h1 className="mt-2 text-2xl font-bold">Sign in to view this asset</h1>
          <p className="mt-2 text-sm text-stone-500">Asset details are shown only to signed-in staff.</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link className="btn-primary" href="/login">Management sign in</Link>
            <Link className="btn" href="/employee/login">Employee sign in</Link>
          </div>
        </section>
      </main>
    );
  }
  const data = await loadAssetForScan(token, viewerFor(session.role));
  if (!data) return notFound();
  if (data.deleted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-kenko-cream p-4">
        <section className="card w-full max-w-md text-center">
          <p className="text-xs font-bold tracking-widest text-red-700">DELETED ASSET</p>
          <h1 className="mt-2 text-2xl font-bold">{data.groups[0]?.fields.find((f) => f.label === "Asset ID")?.value} was deleted from the register</h1>
          <p className="mt-2 text-sm text-stone-500">An Admin, CEO or COO can restore it from the Asset Register&apos;s deleted list.</p>
        </section>
      </main>
    );
  }
  const faId = data.groups[0]?.fields.find((f) => f.label === "Asset ID")?.value;
  return (
    <main className="min-h-screen bg-kenko-cream p-3 sm:p-5">
      <section className="card mx-auto my-4 max-w-4xl sm:my-10">
        <p className="text-xs font-bold tracking-widest text-kenko-green">THE KENKO LIFE · ASSET REGISTER</p>
        <h1 className="mt-2 break-words text-2xl font-bold sm:text-3xl">{faId}</h1>
        <p className="mt-1 text-sm text-stone-500">Live record, last updated {new Date(data.updatedAt).toLocaleString("en-IN")}{data.status ? ` · ${data.status}` : ""}</p>
        {data.groups.map((group) => (
          <div className="mt-6" key={group.id}>
            <h2 className="mb-2 text-sm font-bold text-kenko-green">{group.title}</h2>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.fields.map((field) => (
                <div className="rounded-xl bg-stone-50 p-3" key={field.label}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">{field.label}</dt>
                  <dd className="mt-1 break-words text-sm font-medium">{field.value ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-bold text-kenko-green">Custodian · whose asset it is</h2>
          {data.custodian ? (
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl bg-stone-50 p-3"><dt className="text-xs font-semibold uppercase text-stone-500">Name</dt><dd className="mt-1 text-sm font-medium">{data.custodian.name ?? "—"}</dd></div>
              <div className="rounded-xl bg-stone-50 p-3"><dt className="text-xs font-semibold uppercase text-stone-500">Employee code</dt><dd className="mt-1 text-sm font-medium">{data.custodian.code ?? data.custodian.type}</dd></div>
              <div className="rounded-xl bg-stone-50 p-3"><dt className="text-xs font-semibold uppercase text-stone-500">Held since</dt><dd className="mt-1 text-sm font-medium">{data.custodian.since}</dd></div>
            </dl>
          ) : (
            <p className="rounded-xl bg-stone-50 p-3 text-sm text-stone-600">Not assigned to anyone.</p>
          )}
        </div>
        {data.viewer === "LIMITED" && <p className="mt-6 rounded-lg bg-orange-50 p-3 text-sm text-orange-900">Cost, depreciation and other financial details are available to the Admin, CEO and COO only.</p>}
      </section>
    </main>
  );
}
