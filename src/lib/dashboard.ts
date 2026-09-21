import { db } from "@/lib/db";
import { describeAudit, type ActivityTone, type TransferLookup } from "@/lib/audit-summary";

export type DashboardMetric = {
  key: string;
  label: string;
  value: string;
  note: string;
  tone: "normal" | "attention";
  href: string;
};
export type DashboardAlert = { id: string; severity: "warning" | "info"; message: string; href?: string };
export type DashboardActivity = { id: string; at: string; actor: string; text: string; tone: ActivityTone };
export type DashboardData = {
  generatedAt: string;
  metrics: DashboardMetric[];
  alerts: DashboardAlert[];
  activity: DashboardActivity[];
};

const DAY = 24 * 60 * 60 * 1000;
const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString("en-IN")} ${count === 1 ? one : many}`;

function inr(value: number) {
  return value.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
}

/**
 * Every figure, alert and activity line on the management dashboard is computed here from
 * live database rows — nothing is hard-coded.
 */
export async function loadDashboard(now = new Date()): Promise<DashboardData> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const yearAgo = new Date(now.getTime() - 365 * DAY);
  const threeDaysAgo = new Date(now.getTime() - 3 * DAY);
  const dayAgo = new Date(now.getTime() - DAY);
  const liveAsset = { deletedAt: null, status: { not: "DISPOSED" as const } };

  const [
    employeeStatus,
    joinedThisMonth,
    assetStatus,
    netBook,
    pendingTransfers,
    employeeRequestsPending,
    stalePending,
    exitedHolders,
    deletedEmployees,
    deletedAssets,
    verificationDue,
    missingDepreciation,
    missingOrgCode,
    failedLogins,
    recentLogs,
  ] = await Promise.all([
    db.employee.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } }),
    db.employee.count({
      where: {
        deletedAt: null,
        OR: [{ joiningDate: { gte: monthStart } }, { joiningDate: null, createdAt: { gte: monthStart } }],
      },
    }),
    db.fixedAsset.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } }),
    db.fixedAsset.aggregate({ where: liveAsset, _sum: { netBookValue: true } }),
    db.assetTransfer.count({ where: { status: "PENDING", asset: { deletedAt: null } } }),
    db.assetTransfer.count({ where: { status: "PENDING", kind: "EMPLOYEE_REQUEST", asset: { deletedAt: null } } }),
    db.assetTransfer.count({ where: { status: "PENDING", createdAt: { lt: threeDaysAgo }, asset: { deletedAt: null } } }),
    db.employee.findMany({
      where: { status: "EXITED", deletedAt: null, assignments: { some: { returnedAt: null, asset: { deletedAt: null } } } },
      select: { _count: { select: { assignments: { where: { returnedAt: null, asset: { deletedAt: null } } } } } },
    }),
    db.employee.count({ where: { deletedAt: { not: null } } }),
    db.fixedAsset.count({ where: { deletedAt: { not: null } } }),
    db.fixedAsset.count({ where: { ...liveAsset, OR: [{ verificationDate: null }, { verificationDate: { lt: yearAgo } }] } }),
    db.fixedAsset.count({ where: { ...liveAsset, OR: [{ depreciationMethod: null }, { usefulLife: null }] } }),
    db.employee.count({ where: { deletedAt: null, status: "ACTIVE", dynamicId: null } }),
    db.auditLog.count({ where: { action: "LOGIN_FAILED", createdAt: { gte: dayAgo } } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
  ]);

  const employees = Object.fromEntries(employeeStatus.map((row) => [row.status, row._count._all])) as Record<string, number>;
  const employeeTotal = Object.values(employees).reduce((sum, count) => sum + count, 0);
  const assets = Object.fromEntries(assetStatus.map((row) => [row.status, row._count._all])) as Record<string, number>;
  const assetTotal = Object.values(assets).reduce((sum, count) => sum + count, 0);
  const activeAssets = assetTotal - (assets.DISPOSED ?? 0);
  const exitedHolderCount = exitedHolders.length;
  const exitedAssetCount = exitedHolders.reduce((sum, row) => sum + row._count.assignments, 0);
  const netBookValue = Number(netBook._sum.netBookValue ?? 0);

  const metrics: DashboardMetric[] = [
    {
      key: "employees",
      label: "Total employees",
      value: employeeTotal.toLocaleString("en-IN"),
      note: `${employees.ACTIVE ?? 0} active · ${employees.ON_LEAVE ?? 0} on leave · ${employees.EXITED ?? 0} exited`,
      tone: "normal",
      href: "/employees",
    },
    {
      key: "activeEmployees",
      label: "Active employees",
      value: (employees.ACTIVE ?? 0).toLocaleString("en-IN"),
      note: joinedThisMonth ? `${joinedThisMonth} joined this month` : "No new joiners this month",
      tone: "normal",
      href: "/employees",
    },
    {
      key: "activeAssets",
      label: "Active assets",
      value: activeAssets.toLocaleString("en-IN"),
      note: `${assets.ASSIGNED ?? 0} assigned · ${assets.AVAILABLE ?? 0} available`,
      tone: "normal",
      href: "/assets",
    },
    {
      key: "netBookValue",
      label: "Net book value",
      value: inr(netBookValue),
      note: `Across ${plural(activeAssets, "active asset")}`,
      tone: "normal",
      href: "/assets",
    },
    {
      key: "pendingApprovals",
      label: "Pending approvals",
      value: String(pendingTransfers).padStart(2, "0"),
      note: pendingTransfers
        ? `${employeeRequestsPending} employee-initiated transfer request(s) awaiting a decision`
        : "Nothing is waiting for a decision",
      tone: pendingTransfers ? "attention" : "normal",
      href: "/transfers",
    },
    {
      key: "exitClearances",
      label: "Exit clearances",
      value: String(exitedHolderCount).padStart(2, "0"),
      note: exitedHolderCount ? `${plural(exitedAssetCount, "asset")} still in custody` : "All exited employees have returned their assets",
      tone: exitedHolderCount ? "attention" : "normal",
      href: "/employees",
    },
    {
      key: "underRepair",
      label: "Assets under repair",
      value: String(assets.UNDER_REPAIR ?? 0).padStart(2, "0"),
      note: `${assets.DISPOSED ?? 0} disposed to date`,
      tone: "normal",
      href: "/assets",
    },
    {
      key: "deletedRecords",
      label: "Deleted records",
      value: (deletedEmployees + deletedAssets).toLocaleString("en-IN"),
      note: `${plural(deletedEmployees, "employee")} · ${plural(deletedAssets, "asset")} in deletion history`,
      tone: "normal",
      href: "/employees",
    },
  ];

  const alerts: DashboardAlert[] = [];
  if (exitedHolderCount) {
    alerts.push({
      id: "exit-clearance",
      severity: "warning",
      message: `${plural(exitedHolderCount, "exited employee")} still ${exitedHolderCount === 1 ? "holds" : "hold"} ${plural(exitedAssetCount, "asset")}. Recover or transfer them.`,
      href: "/assets",
    });
  }
  if (stalePending) {
    alerts.push({
      id: "stale-transfers",
      severity: "warning",
      message: `${plural(stalePending, "transfer request")} ${stalePending === 1 ? "has" : "have"} waited more than 3 days for a decision.`,
      href: "/transfers",
    });
  }
  if (failedLogins >= 3) {
    alerts.push({
      id: "failed-logins",
      severity: "warning",
      message: `${failedLogins} failed sign-in attempts in the last 24 hours. Check the audit log for unfamiliar accounts.`,
      href: "/audit",
    });
  }
  if (missingDepreciation) {
    alerts.push({
      id: "missing-depreciation",
      severity: "warning",
      message: `${plural(missingDepreciation, "active asset")} ${missingDepreciation === 1 ? "has" : "have"} no depreciation method or useful life, so book value cannot be calculated.`,
      href: "/assets",
    });
  }
  if (verificationDue) {
    alerts.push({
      id: "verification-due",
      severity: "info",
      message: `Physical verification is due for ${plural(verificationDue, "asset")} (never verified, or last verified over 12 months ago).`,
      href: "/assets",
    });
  }
  if (assets.UNDER_REPAIR) {
    alerts.push({ id: "under-repair", severity: "info", message: `${plural(assets.UNDER_REPAIR, "asset")} currently under repair.`, href: "/assets" });
  }
  if (missingOrgCode) {
    alerts.push({
      id: "missing-org-code",
      severity: "info",
      message: `${plural(missingOrgCode, "active employee")} ${missingOrgCode === 1 ? "is" : "are"} missing organisation fields (city, outlet model, area code, outlets, department or role), so no Organisation Code was generated.`,
      href: "/employees",
    });
  }

  const transferIds = recentLogs.filter((log) => log.recordType === "AssetTransfer").map((log) => log.recordId);
  const transfers = new Map<string, TransferLookup>();
  if (transferIds.length) {
    const rows = await db.assetTransfer.findMany({
      where: { id: { in: transferIds } },
      select: {
        id: true,
        asset: { select: { faId: true } },
        receiver: { select: { permanentId: true, name: true } },
        sender: { select: { permanentId: true, name: true } },
      },
    });
    for (const row of rows) {
      transfers.set(row.id, {
        faId: row.asset.faId,
        receiver: `${row.receiver.permanentId} · ${row.receiver.name}`,
        sender: row.sender ? `${row.sender.permanentId} · ${row.sender.name}` : undefined,
      });
    }
  }

  const activity: DashboardActivity[] = recentLogs.map((log) => {
    const line = describeAudit(log, transfers);
    return { id: log.id, at: log.createdAt.toISOString(), ...line };
  });

  return { generatedAt: now.toISOString(), metrics, alerts, activity };
}
