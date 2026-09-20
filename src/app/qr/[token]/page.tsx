import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { readSessionToken, MANAGEMENT_ROLES } from "@/lib/auth";

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) return value.toLocaleDateString("en-IN");
  return String(value);
}

// QR access is role- and ownership-gated, enforced here on the server for every request:
// - Unauthenticated visitors: denied outright (no asset data of any kind).
// - Management roles (ADMIN/CEO/COO/HR/CFO): full asset record.
// - Employees: only the restricted, non-financial field set, and only for an asset
//   currently assigned to them. Scanning another employee's asset QR is denied.
export default async function AssetQrPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get("kenko_session")?.value);

  if (!session) {
    return (
      <main className="min-h-screen bg-kenko-cream p-5">
        <section className="card mx-auto my-10 max-w-lg text-center">
          <p className="text-xs font-bold tracking-widest text-kenko-green">THE KENKO LIFE · ASSET REGISTER</p>
          <h1 className="mt-3 text-2xl font-bold">Sign in to view this asset</h1>
          <p className="mt-2 text-sm text-stone-500">
            This QR code only shows asset details to signed-in staff or the employee it is assigned to.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <a className="btn-primary" href="/login">Management sign in</a>
            <a className="btn" href="/employee">Employee Portal</a>
          </div>
        </section>
      </main>
    );
  }

  const isManagement = MANAGEMENT_ROLES.includes(session.role);
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
            include: { employee: { select: { id: true, permanentId: true, name: true } } },
            take: 1,
          },
        },
      },
    },
  });
  if (!qr) return notFound();
  const asset = qr.asset;
  const custodian = asset.assignments[0]?.employee;
  const isAssignedEmployee = session.role === "EMPLOYEE" && custodian?.id === session.employeeId;

  if (!isManagement && !isAssignedEmployee) {
    return (
      <main className="min-h-screen bg-kenko-cream p-5">
        <section className="card mx-auto my-10 max-w-lg text-center">
          <p className="text-xs font-bold tracking-widest text-kenko-orange">ACCESS DENIED</p>
          <h1 className="mt-3 text-2xl font-bold">This asset isn&apos;t assigned to you</h1>
          <p className="mt-2 text-sm text-stone-500">
            Only the employee this asset is currently assigned to, or an authorized manager, can view its details.
          </p>
        </section>
      </main>
    );
  }

  const employeeDetails: [string, unknown][] = [
    ["Asset ID", asset.faId],
    ["Category", asset.category],
    ["Description", asset.description],
    ["Model", asset.makeModel],
    ["Vendor Name", asset.vendorName],
    ["Invoice Number", asset.invoiceNo],
    ["Invoice Date", asset.invoiceDate],
    ["Purchase Date", asset.capitalisationDate],
  ];
  const managementDetails: [string, unknown][] = [
    ["Asset ID", asset.faId],
    ["Category", asset.category],
    ["Description", asset.description],
    ["Make / model", asset.makeModel],
    ["Serial number", asset.serialNo],
    ["Status", asset.status],
    ["Last updated", asset.updatedAt],
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
    ["Disposal reason", asset.disposalReason],
    ["Disposal remarks", asset.disposalRemarks],
    ["Sale proceeds", asset.saleProceeds],
    ["Verification date", asset.verificationDate],
    ["Verification status", asset.verificationStatus],
  ];
  const details = isManagement ? managementDetails : employeeDetails;

  return (
    <main className="min-h-screen bg-kenko-cream p-5">
      <section className="card mx-auto my-10 max-w-4xl">
        <p className="text-xs font-bold tracking-widest text-kenko-green">THE KENKO LIFE · ASSET REGISTER</p>
        <h1 className="mt-2 text-3xl font-bold">{asset.faId}</h1>
        <p className="mt-1 text-sm text-stone-500">
          {isManagement ? "Authoritative asset details from the live register." : "Details for the asset assigned to you."}
        </p>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {details.map(([label, value]) => (
            <div className="rounded-xl bg-stone-50 p-3" key={label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</dt>
              <dd className="mt-1 break-words text-sm font-medium">{display(value)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
