import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { workbookResponse } from "@/lib/excel";
import { audit } from "@/lib/audit";
import { employeeInclude } from "@/lib/employees";
import { employeeImportColumns, assetImportColumns } from "@/lib/imports";

const headers = {
  "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "Content-Disposition": "attachment; filename=kenko-export.xlsx",
};

export async function GET(req: NextRequest) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const type = req.nextUrl.searchParams.get("type");
    let rows: Record<string, unknown>[] = [];
    if (type === "employees") {
      const employees = await db.employee.findMany({ include: employeeInclude, orderBy: { permanentId: "asc" } });
      rows = employees.map((employee, index) => ({
        "S.No": index + 1,
        "Employee Code": employee.permanentId,
        CODE: employee.dynamicId,
        City: employee.city?.name,
        "City Code": employee.city?.code,
        "Outlet Model": employee.outletModel?.name,
        "Outlet Model Code": employee.outletModel?.code,
        "Special / Area Code": employee.specialBranchCode?.code,
        "No. of Outlets": employee.numberOfOutlets,
        Department: employee.department?.name,
        "Department Code": employee.department?.code,
        "Employee Role": employee.employeeRole?.name,
        "Employee Role Code": employee.employeeRole?.code,
        "Team Office Code": employee.teamOfficeCode,
        "Name as per PAN": employee.name,
        "Date of Joining": employee.joiningDate,
        "Last Day of Working": employee.exitDate,
        Designation: employee.designation?.name,
        Gender: employee.gender,
        "Personal Email": employee.personalEmail || employee.email,
        "Father Name": employee.fatherName,
        "Mobile Number": employee.phone,
        "Date of Birth": employee.dateOfBirth,
        "Address Line 1": employee.address1,
        "Address Line 2": employee.address2,
        "PIN Code": employee.pinCode,
        State: employee.state,
        PAN: employee.pan ? `****${employee.pan.slice(-4)}` : "",
        Aadhaar: employee.aadhaar ? `********${employee.aadhaar.slice(-4)}` : "",
        "Bank Holder Name": employee.bankHolderName,
        "Bank Name": employee.bankName,
        "Account Number": employee.accountNumber ? `****${employee.accountNumber.slice(-4)}` : "",
        "IFSC Code": employee.ifscCode,
        "PF Eligible": employee.pfEligible,
        "PF Account Number": employee.pfAccountNumber,
        "UAN Number": employee.uanNumber,
        "ESIC Number": employee.esicNumber,
        Status: employee.status,
      }));
    } else if (type === "assets") {
      if (!MANAGEMENT_ROLES.includes(session.role)) {
        return NextResponse.json({ error: "Management access required for asset export" }, { status: 403 });
      }
      const assets = await db.fixedAsset.findMany({
        include: {
          location: true,
          department: true,
          costCentre: true,
          assignments: { where: { returnedAt: null }, include: { employee: true }, take: 1 },
        },
      });
      rows = assets.map((asset, index) => ({
        "S.No": index + 1,
        "Asset ID": asset.faId,
        Category: asset.category,
        Description: asset.description,
        "Serial No": asset.serialNo,
        Location: asset.location?.name,
        Department: asset.department?.name,
        "Cost Centre": asset.costCentre?.name,
        Custodian: asset.assignments[0]?.employee?.permanentId || asset.assignments[0]?.custodianName,
        "Vendor Name": asset.vendorName,
        "Invoice No": asset.invoiceNo,
        "Depreciation Method": asset.depreciationMethod,
        "Purchase Cost": String(asset.purchaseCost),
        "Total Capitalised Cost": String(asset.totalCapitalisedCost),
        "Net Book Value": String(asset.netBookValue),
        "Tax Additions": String(asset.taxAdditions),
        "Tax Disposals": String(asset.taxDisposals),
        "WDV Before Depreciation": String(asset.wdvBeforeDepreciation),
        "Disposal Reason": asset.disposalReason,
        "Disposal Remarks": asset.disposalRemarks,
        "Profit/Loss on Disposal": String(asset.profitLossOnDisposal),
        Status: asset.status,
      }));
    } else if (type === "audit") {
      if (!MANAGEMENT_ROLES.includes(session.role)) return NextResponse.json({ error: "Management access required" }, { status: 403 });
      const entries = await db.auditLog.findMany({ orderBy: { createdAt: "desc" } });
      rows = entries.map((entry) => ({
        Timestamp: entry.createdAt.toISOString(),
        Actor: entry.email || entry.actorId,
        Role: entry.role,
        Module: entry.module,
        Entity: entry.recordType,
        "Record ID": entry.recordId,
        Action: entry.action,
        Before: JSON.stringify(entry.previousValue),
        After: JSON.stringify(entry.newValue),
        Details: JSON.stringify(entry.metadata),
        Reason: entry.reason,
      }));
    } else if (type === "employee-template") {
      rows = [Object.fromEntries(employeeImportColumns.map((column) => [column.header, ""]))];
    } else if (type === "asset-template") {
      rows = [Object.fromEntries(assetImportColumns.map((column) => [column.header, ""]))];
    } else {
      return NextResponse.json({ error: "Unknown export" }, { status: 400 });
    }
    const file = workbookResponse(rows, "Kenko Export");
    await audit({
      actorId: session.userId,
      email: session.email,
      role: session.role,
      module: "EXPORT",
      recordType: "Export",
      recordId: type || "unknown",
      action: "EXPORTED",
      metadata: { rowCount: rows.length },
    });
    return new NextResponse(file, { headers });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
