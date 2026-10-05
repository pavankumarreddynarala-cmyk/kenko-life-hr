import { nameFromEmail, roleLabel } from "@/lib/permissions";

export type AuditLike = {
  id: string;
  createdAt: Date | string;
  actorId?: string | null;
  email?: string | null;
  role?: string | null;
  module: string;
  recordType: string;
  recordId: string;
  action: string;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: unknown;
  reason?: string | null;
};

export type TransferLookup = { faId: string; receiver?: string; sender?: string };
export type ActivityTone = "info" | "success" | "warning";
export type ActivityLine = { actor: string; text: string; tone: ActivityTone };

type Rec = Record<string, unknown>;
const rec = (value: unknown): Rec => (value && typeof value === "object" ? (value as Rec) : {});
const str = (value: unknown) => (typeof value === "string" && value ? value : undefined);

function actorOf(log: AuditLike): string {
  const email = log.email || (log.actorId?.includes("@") ? log.actorId : undefined);
  if (!email) return "System";
  const name = nameFromEmail(email);
  // "Admin (Admin)" / "Coo (COO)" repeat themselves — show the role only when it adds something.
  return log.role && roleLabel(log.role).toLowerCase() !== name.toLowerCase() ? `${name} (${roleLabel(log.role)})` : name;
}

function employeeSubject(log: AuditLike): string {
  const value = { ...rec(log.previousValue), ...rec(log.newValue) };
  const code = str(value.permanentId);
  const name = str(value.name);
  return [code, name].filter(Boolean).join(" · ") || log.recordId;
}

function assetSubject(log: AuditLike): string {
  const value = { ...rec(log.previousValue), ...rec(log.newValue) };
  const faId = str(value.faId);
  const description = str(value.description);
  return faId ? (description ? `${faId} · ${description}` : faId) : log.recordId;
}

function masterSubject(log: AuditLike): string {
  const value = { ...rec(log.previousValue), ...rec(log.newValue) };
  const name = str(value.name);
  const code = str(value.code);
  const label = log.recordType === "CustomMasterValue" || log.recordType === "CustomMasterType"
    ? str(rec(log.metadata).typeName) ?? "custom master"
    : log.recordType.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return `${label} “${name ?? log.recordId}”${code ? ` (${code})` : ""}`;
}

function withReason(text: string, reason?: string | null) {
  return reason ? `${text} — reason: ${reason}` : text;
}

/**
 * Turns one audit-log row into a sentence for the dashboard's Recent activity feed.
 * `transfers` supplies asset/employee identifiers for transfer events, whose audit rows
 * only store internal ids.
 */
export function describeAudit(log: AuditLike, transfers?: Map<string, TransferLookup>): ActivityLine {
  const actor = actorOf(log);
  const line = (text: string, tone: ActivityTone = "info"): ActivityLine => ({ actor, text, tone });
  const { module, recordType, action } = log;

  if (module === "AUTH") {
    switch (action) {
      case "LOGIN_SUCCESS":
        return line("signed in", "success");
      case "LOGIN_FAILED":
        return { actor: "Security", text: `Failed sign-in attempt for ${log.recordId}`, tone: "warning" };
      case "LOGOUT":
        return line("signed out");
      case "SESSION_TIMEOUT":
        return line("was signed out automatically after 5 minutes of inactivity");
      case "PASSWORD_CHANGED":
        return line("changed their password", "success");
      case "OTP_REQUESTED":
        return { actor: "Employee Portal", text: `${log.recordId} requested a sign-in OTP`, tone: "info" };
      case "OTP_VERIFIED":
        return { actor: "Employee Portal", text: `${log.recordId} signed in with an OTP`, tone: "success" };
      case "OTP_FAILED":
        return { actor: "Security", text: `Wrong OTP entered for ${log.recordId}`, tone: "warning" };
    }
  }

  if (action === "CATEGORY_CREATED" || action === "CATEGORY_UPDATED") {
    const name = str(rec(log.newValue).name) ?? log.recordId;
    return line(`${action === "CATEGORY_CREATED" ? "added" : "updated"} depreciation category “${name}”`);
  }
  if (action === "TAX_BLOCK_CREATED" || action === "TAX_BLOCK_UPDATED") {
    const name = str(rec(log.newValue).name) ?? log.recordId;
    return line(`${action === "TAX_BLOCK_CREATED" ? "added" : "updated"} income-tax block “${name}”`);
  }
  if (action === "YEAR_ADDED") return line("added a financial year to the depreciation list");
  if (action === "LOGIN_CREATED") return line(`created a login for ${log.recordId}`, "success");
  if (action === "LOGIN_PASSWORD_RESET") return line(`reset the password for ${log.recordId}`, "warning");
  if (action === "MASTER_ACTIVATED" || action === "MASTER_DEACTIVATED") {
    return line(`${action === "MASTER_ACTIVATED" ? "activated" : "deactivated"} ${masterSubject(log)}`, action === "MASTER_ACTIVATED" ? "success" : "warning");
  }

  if (module === "VENDOR") {
    const who = str(rec(log.metadata).vendorEmail) ?? str(rec(log.newValue).email) ?? log.recordId;
    switch (action) {
      case "INVITED":
        return line(`sent a vendor link to ${str(rec(log.newValue).email) ?? who}`);
      case "INVITE_REISSUED":
        return line(`sent a new vendor link to ${str(rec(log.newValue).email) ?? who}`);
      case "SUBMITTED":
        return { actor: who, text: "submitted their vendor details", tone: "success" };
      case "UPDATED":
        return line(`updated vendor ${who}`);
      case "SELF_UPDATED":
        return { actor: who, text: "updated their own vendor details", tone: "info" };
      case "BANK_DETAILS_CHANGED":
        return { actor: log.email ?? who, text: `changed the bank details of vendor ${who}`, tone: "warning" };
      case "ACTIVATED":
        return line(`activated vendor ${who}`, "success");
      case "DEACTIVATED":
        return line(`deactivated vendor ${who}`, "warning");
    }
  }
  if (module === "SOP") {
    const title = str(rec(log.newValue).title) ?? str(rec(log.previousValue).title) ?? log.recordId;
    switch (action) {
      case "CREATED":
        return line(`uploaded SOP “${title}”`, "success");
      case "FILE_REPLACED":
        return line(`replaced the file of SOP “${title}”`);
      case "RETAGGED":
        return line(`changed who can see SOP “${title}”`);
      case "UPDATED":
        return line(`updated SOP “${title}”`);
      case "DELETED":
        return line(`deleted SOP “${title}”`, "warning");
    }
  }
  if (module === "LETTER") {
    const meta = rec(log.metadata);
    switch (action) {
      case "TEMPLATE_UPLOADED":
        return line(`uploaded letter template “${str(rec(log.newValue).name) ?? log.recordId}”`, "success");
      case "TEMPLATE_REPLACED":
        return line(`replaced letter template “${str(rec(log.newValue).name) ?? log.recordId}”`);
      case "TEMPLATE_UPDATED":
        return line(`updated letter template “${str(rec(log.newValue).name) ?? log.recordId}”`);
      case "DOWNLOADED_DOCX":
      case "DOWNLOADED_PDF":
        return line(`downloaded a ${str(meta.template) ?? "letter"} for ${str(meta.employee) ?? "an employee"}`);
      case "EMAILED_PDF":
        return line(`emailed a ${str(meta.template) ?? "letter"} to ${str(meta.sentTo) ?? "an employee"}`, "success");
    }
  }

  if (recordType === "Employee") {
    const subject = employeeSubject(log);
    switch (action) {
      case "CREATED":
        return line(`added employee ${subject}`, "success");
      case "UPDATED":
        return line(`updated employee ${subject}`);
      case "DELETED":
        return line(withReason(`deleted employee ${subject}`, log.reason), "warning");
      case "RESTORED":
        return line(`restored employee ${subject}`, "success");
      case "ONBOARDED":
        return { actor: subject, text: "completed employee onboarding", tone: "success" };
      case "SELF_UPDATED":
        return { actor: subject, text: "updated their own details", tone: "info" };
      case "IMPORTED":
        return line(`imported employee ${subject}`, "success");
      case "EMPLOYEE_CODE_CHANGED": {
        const before = str(rec(log.previousValue).permanentId);
        const after = str(rec(log.newValue).permanentId);
        return line(`changed an Employee Code from ${before ?? "?"} to ${after ?? "?"}`, "warning");
      }
    }
  }

  if (recordType === "FixedAsset") {
    const subject = assetSubject(log);
    switch (action) {
      case "CREATED":
        return line(`registered asset ${subject}`, "success");
      case "UPDATED":
        return line(`updated asset ${subject}`);
      case "DELETED":
        return line(withReason(`deleted asset ${subject}`, log.reason), "warning");
      case "RESTORED":
        return line(`restored asset ${subject}`, "success");
      case "IMPORTED":
        return line(`imported asset ${subject}`, "success");
    }
  }

  if (recordType === "AssetTransfer") {
    const info = transfers?.get(log.recordId);
    const asset = info?.faId ?? "an asset";
    const to = info?.receiver ? ` to ${info.receiver}` : "";
    switch (action) {
      case "ADMIN_TRANSFERRED":
        return line(`transferred ${asset}${to}`, "success");
      case "REQUESTED":
        return line(`requested a transfer of ${asset}${to}`);
      case "ACCEPTED":
        return line(`accepted the transfer of ${asset}${info?.receiver ? ` (${info.receiver})` : ""}`, "success");
      case "REJECTED":
        return line(`declined the transfer of ${asset}`, "warning");
      case "REVOKED":
        return line(`withdrew the transfer of ${asset}`);
      case "UPDATED":
        return line(`edited the transfer of ${asset}`);
      case "REVOKED_ASSET_DISPOSED":
        return line(`cancelled the pending transfer of ${asset} because it was disposed`, "warning");
    }
  }

  if (module === "ORGANISATION") {
    const subject = masterSubject(log);
    switch (action) {
      case "MASTER_CREATED":
      case "MASTER_TYPE_CREATED":
      case "MASTER_VALUE_CREATED":
        return line(`added ${subject} to Master Data`, "success");
      case "MASTER_UPDATED":
      case "MASTER_TYPE_UPDATED":
      case "MASTER_VALUE_UPDATED":
        return line(`edited ${subject} in Master Data`);
      case "MASTER_DELETED":
      case "MASTER_TYPE_DELETED":
      case "MASTER_VALUE_DELETED":
        return line(`deleted ${subject} from Master Data`, "warning");
    }
  }

  if (module === "EXPORT") return line(`exported ${log.recordId} data to Excel`);
  if (module === "IMPORT") {
    const meta = rec(log.metadata);
    if (action === "VALIDATED") return line(`validated an import file (${meta.validCount ?? 0} valid rows)`);
    if (action === "IMPORTED") return line(`completed an import of ${meta.imported ?? 0} ${meta.type ?? "record"}(s)`, "success");
  }
  if (action === "QR_BULK_DOWNLOADED") return line("downloaded all asset QR codes");

  return line(`${action.toLowerCase().replace(/_/g, " ")} · ${recordType}`);
}
