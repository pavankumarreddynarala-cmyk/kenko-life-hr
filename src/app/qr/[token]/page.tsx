import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { readSessionToken } from "@/lib/auth";

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) return value.toLocaleDateString("en-IN");
  return String(value);
}

export default async function AssetQrPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get("kenko_session")?.value);
  const canViewSensitive = Boolean(session && ["ADMIN", "HR", "CFO"].includes(session.role));
  const qr = await db.assetQRCode.findUnique({
    where: { token },
    include: {
      asset: {
        include: {
          company: true,
          location: true,
          department: true,
          costCentre: true,
          assignments: {
            where: { returnedAt: null },
            include: { employee: { select: { permanentId: true, name: true } } },
            take: 1,
          },
        },
      },
    },
  });
  if (!qr) return notFound();
  const asset = qr.asset;
  const custodian = asset.assignments[0]?.employee;
  const publicDetails: [string, unknown][] = [
    ["Asset ID", asset.faId],
    ["Category", asset.category],
    ["Description", asset.description],
    ["Make / model", asset.makeModel],
    ["Serial number", asset.serialNo],
    ["Status", asset.status],
    ["Last updated", asset.updatedAt],
  ];
  const sensitiveDetails: [string, unknown][] = [
    ["Company", asset.company?.name],
    ["Location", asset.location?.name],
    ["Department", asset.department?.name],
    ["Cost centre", asset.costCentre?.name],
    ["Custodian", custodian ? `${custodian.permanentId} · ${custodian.name}` : asset.assignments[0]?.custodianName],
    ["Vendor", asset.vendorName],
    ["Invoice number", asset.invoiceNo],
    ["Invoice date", asset.invoiceDate],
    ["Capitalisation date", asset.capitalisationDate],
    ["PO / GRN", asset.poGrnNo],
    ["Purchase cost", asset.purchaseCost],
    ["Freight", asset.freight],
    ["Installation cost", asset.installationCost],
    ["Other cost", asset.otherCost],
    ["Total capitalised cost", asset.totalCapitalisedCost],
    ["GST amount", asset.gstAmount],
    ["ITC eligible", asset.itcEligible ? "Yes" : "No"],
    ["ITC availed", asset.itcAvailed],
    ["Depreciation method", asset.depreciationMethod],
    ["Useful life", asset.usefulLife],
    ["Residual value", asset.residualValue],
    ["Net book value", asset.netBookValue],
    ["Tax block", asset.taxBlock],
    ["Closing WDV", asset.closingWdv],
    ["Disposal date", asset.disposalDate],
    ["Disposal method", asset.disposalMethod],
    ["Sale proceeds", asset.saleProceeds],
    ["Verification date", asset.verificationDate],
    ["Verification status", asset.verificationStatus],
  ];
  const details = canViewSensitive ? [...publicDetails, ...sensitiveDetails] : publicDetails;
  return (
    <main className="min-h-screen bg-kenko-cream p-5">
      <section className="card mx-auto my-10 max-w-4xl">
        <p className="text-xs font-bold tracking-widest text-kenko-green">THE KENKO LIFE · ASSET REGISTER</p>
        <h1 className="mt-2 text-3xl font-bold">{asset.faId}</h1>
        <p className="mt-1 text-sm text-stone-500">Authoritative asset details from the live register.</p>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {details.map(([label, value]) => (
            <div className="rounded-xl bg-stone-50 p-3" key={label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</dt>
              <dd className="mt-1 break-words text-sm font-medium">{display(value)}</dd>
            </div>
          ))}
        </dl>
        {!canViewSensitive && (
          <p className="mt-6 rounded-lg bg-orange-50 p-3 text-sm text-orange-900">
            Sign in as an authorized manager to view custody and financial details.
          </p>
        )}
      </section>
    </main>
  );
}
