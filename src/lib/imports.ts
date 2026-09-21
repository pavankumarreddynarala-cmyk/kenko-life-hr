import * as XLSX from "xlsx";
import { masterDefinitions, type MasterType } from "@/lib/masters";
import { employeeAdminSchema } from "@/lib/validators";
import { assetSchema, itcIssue } from "@/lib/assets";

export type ImportColumn = {
  header: string;
  field: string;
  kind: "text" | "date" | "number" | "boolean" | "masterCode";
  master?: MasterType;
};

// Single source of truth for both "Download Template" and "Import": the template's
// headers are generated from this list, and the importer parses uploads against the
// same list, so the two can never drift apart.
export const employeeImportColumns: ImportColumn[] = [
  { header: "Name as per PAN", field: "name", kind: "text" },
  { header: "Team Office Code", field: "teamOfficeCode", kind: "text" },
  { header: "Mobile Number", field: "phone", kind: "text" },
  { header: "Work Email", field: "email", kind: "text" },
  { header: "Personal Email", field: "personalEmail", kind: "text" },
  { header: "Father Name", field: "fatherName", kind: "text" },
  { header: "Gender (FEMALE/MALE/NON_BINARY/PREFER_NOT_TO_SAY)", field: "gender", kind: "text" },
  { header: "Date of Birth", field: "dateOfBirth", kind: "date" },
  { header: "PAN", field: "pan", kind: "text" },
  { header: "Aadhaar", field: "aadhaar", kind: "text" },
  { header: "Address Line 1", field: "address1", kind: "text" },
  { header: "Address Line 2", field: "address2", kind: "text" },
  { header: "PIN Code", field: "pinCode", kind: "text" },
  { header: "State", field: "state", kind: "text" },
  { header: "Company Code", field: "companyId", kind: "masterCode", master: "company" },
  { header: "Location Code", field: "locationId", kind: "masterCode", master: "location" },
  { header: "City Code", field: "cityId", kind: "masterCode", master: "city" },
  { header: "Branch Code", field: "branchId", kind: "masterCode", master: "branch" },
  { header: "Outlet Model Code", field: "outletModelId", kind: "masterCode", master: "outletModel" },
  { header: "Special / Area Code", field: "specialBranchCodeId", kind: "masterCode", master: "specialBranchCode" },
  { header: "No. of Outlets", field: "numberOfOutlets", kind: "number" },
  { header: "Department Code", field: "departmentId", kind: "masterCode", master: "department" },
  { header: "Employee Role Code", field: "employeeRoleId", kind: "masterCode", master: "employeeRole" },
  { header: "Designation Code", field: "designationId", kind: "masterCode", master: "designation" },
  { header: "Cost Centre Code", field: "costCentreId", kind: "masterCode", master: "costCentre" },
  { header: "Date of Joining", field: "joiningDate", kind: "date" },
  { header: "Employment Status (ACTIVE/ON_LEAVE/EXITED)", field: "status", kind: "text" },
];

export const assetImportColumns: ImportColumn[] = [
  { header: "Asset ID", field: "faId", kind: "text" },
  { header: "Asset Category", field: "category", kind: "text" },
  { header: "Asset Description", field: "description", kind: "text" },
  { header: "Make / Model", field: "makeModel", kind: "text" },
  { header: "Serial No", field: "serialNo", kind: "text" },
  { header: "Vendor Name", field: "vendorName", kind: "text" },
  { header: "Invoice No", field: "invoiceNo", kind: "text" },
  { header: "Invoice Date", field: "invoiceDate", kind: "date" },
  { header: "Capitalisation Date", field: "capitalisationDate", kind: "date" },
  { header: "PO / GRN No", field: "poGrnNo", kind: "text" },
  { header: "Company Code", field: "companyId", kind: "masterCode", master: "company" },
  { header: "Location Code", field: "locationId", kind: "masterCode", master: "location" },
  { header: "Department Code", field: "departmentId", kind: "masterCode", master: "department" },
  { header: "Cost Centre Code", field: "costCentreId", kind: "masterCode", master: "costCentre" },
  { header: "Purchase Cost", field: "purchaseCost", kind: "number" },
  { header: "Freight", field: "freight", kind: "number" },
  { header: "Installation Cost", field: "installationCost", kind: "number" },
  { header: "Other Direct Cost", field: "otherCost", kind: "number" },
  { header: "GST Amount", field: "gstAmount", kind: "number" },
  { header: "ITC Eligible (Yes/No)", field: "itcEligible", kind: "boolean" },
  { header: "ITC Availed", field: "itcAvailed", kind: "number" },
  { header: "Depreciation Method (SLM/WDV)", field: "depreciationMethod", kind: "text" },
  { header: "Useful Life (Years)", field: "usefulLife", kind: "number" },
  { header: "Residual Value", field: "residualValue", kind: "number" },
  { header: "Income-tax Block", field: "taxBlock", kind: "text" },
  { header: "Tax Depreciation Rate (%)", field: "taxRate", kind: "number" },
];

export type RowError = { rowNumber: number; field?: string; message: string; raw?: unknown };

export async function parseWorkbook(buffer: ArrayBuffer): Promise<Record<string, unknown>[]> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

/** Batch-resolves every master code referenced anywhere in the sheet, one query per
 *  master type rather than one per cell. */
async function resolveMasterCodes(columns: ImportColumn[], rows: Record<string, unknown>[]) {
  const needed = new Map<MasterType, Set<string>>();
  for (const column of columns) {
    if (column.kind !== "masterCode" || !column.master) continue;
    const set = needed.get(column.master) ?? new Set<string>();
    for (const row of rows) {
      const raw = String(row[column.header] ?? "").trim().toUpperCase();
      if (raw) set.add(raw);
    }
    needed.set(column.master, set);
  }
  const maps = new Map<MasterType, Map<string, string>>();
  for (const [master, codes] of needed) {
    const delegate = masterDefinitions[master].delegate as unknown as {
      findMany: (args: { where: { code: { in: string[] } } }) => Promise<{ id: string; code: string }[]>;
    };
    const found = await delegate.findMany({ where: { code: { in: Array.from(codes) } } });
    maps.set(master, new Map(found.map((item) => [item.code.toUpperCase(), item.id])));
  }
  return maps;
}

function coerceCell(column: ImportColumn, raw: unknown, rowNumber: number, errors: RowError[]) {
  const value = typeof raw === "string" ? raw.trim() : raw;
  if (value === "" || value === undefined || value === null) return undefined;
  switch (column.kind) {
    case "text":
      return String(value);
    case "date": {
      const parsed = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(parsed.getTime())) {
        errors.push({ rowNumber, field: column.header, message: `"${value}" is not a valid date`, raw: value });
        return undefined;
      }
      return parsed.toISOString();
    }
    case "number": {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        errors.push({ rowNumber, field: column.header, message: `"${value}" is not a valid number`, raw: value });
        return undefined;
      }
      return parsed;
    }
    case "boolean":
      return ["yes", "true", "y", "1"].includes(String(value).trim().toLowerCase());
    default:
      return value;
  }
}

export type ValidationResult<T> = { validRows: T[]; errors: RowError[]; totalRows: number };

/**
 * Validates an uploaded sheet against `columns`, resolving master-code columns to
 * their real IDs, then re-checking the mapped row through the same zod schema the
 * admin UI uses (`employeeAdminSchema` or `assetSchema`) so an import can never create
 * a record the manual "Add" form would have rejected. Also flags duplicates — both
 * within the file and against what's already in the database — for the fields the
 * spec calls out (Employee: phone/email; Asset: Asset ID).
 */
export async function validateImportRows(
  type: "employees" | "assets",
  rows: Record<string, unknown>[],
  existingKeys: { checkDuplicates: (candidateValues: string[]) => Promise<Set<string>> },
): Promise<ValidationResult<Record<string, unknown>>> {
  const columns = type === "employees" ? employeeImportColumns : assetImportColumns;
  const masterMaps = await resolveMasterCodes(columns, rows);
  const errors: RowError[] = [];
  const mapped: Record<string, unknown>[] = [];
  const seenWithinFile = new Set<string>();

  const dedupeField = type === "employees" ? ["phone", "email"] : ["faId"];
  const dedupeCandidates: string[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // header row is row 1
    const data: Record<string, unknown> = {};
    for (const column of columns) {
      if (column.kind === "masterCode") {
        const raw = String(row[column.header] ?? "").trim().toUpperCase();
        if (!raw) continue;
        const id = masterMaps.get(column.master as MasterType)?.get(raw);
        if (!id) {
          errors.push({ rowNumber, field: column.header, message: `"${raw}" was not found in ${masterDefinitions[column.master as MasterType].label}. Add it under Master Data first.`, raw });
          continue;
        }
        data[column.field] = id;
        continue;
      }
      const value = coerceCell(column, row[column.header], rowNumber, errors);
      if (value !== undefined) data[column.field] = value;
    }

    const schema = type === "employees" ? employeeAdminSchema : assetSchema;
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ rowNumber, field: issue.path.join(".") || undefined, message: issue.message, raw: data });
      }
      return;
    }

    // Duplicate checks run on the VALIDATED, normalized values (e.g. phone already
    // normalized to +91XXXXXXXXXX) so two differently-formatted entries for the same
    // person/asset are still caught.
    const validated = parsed.data as Record<string, unknown>;
    if (type === "assets") {
      const itc = itcIssue(validated);
      if (itc) {
        errors.push({ rowNumber, field: "ITC Availed", message: itc.message, raw: validated.itcAvailed });
        return;
      }
    }
    let duplicateWithinFile = false;
    for (const field of dedupeField) {
      const value = String(validated[field] ?? "").trim().toLowerCase();
      if (!value) continue;
      const dedupeKey = `${field}:${value}`;
      if (seenWithinFile.has(dedupeKey)) {
        errors.push({ rowNumber, field, message: `Duplicate ${field} "${validated[field]}" also appears earlier in this file`, raw: validated[field] });
        duplicateWithinFile = true;
      } else {
        seenWithinFile.add(dedupeKey);
        dedupeCandidates.push(dedupeKey);
      }
    }
    if (duplicateWithinFile) return;

    mapped.push({ ...validated, __rowNumber: rowNumber });
  });

  const existingDuplicates = await existingKeys.checkDuplicates(dedupeCandidates);
  const validRows = mapped.filter((row) => {
    const rowNumber = row.__rowNumber as number;
    for (const field of dedupeField) {
      const value = String(row[field] ?? "").trim().toLowerCase();
      if (!value) continue;
      const key = `${field}:${value}`;
      if (existingDuplicates.has(key)) {
        errors.push({ rowNumber, field, message: `${field} "${row[field]}" already exists in the database`, raw: row[field] });
        return false;
      }
    }
    return true;
  });

  return { validRows, errors, totalRows: rows.length };
}
