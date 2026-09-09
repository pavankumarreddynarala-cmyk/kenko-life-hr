-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'HR', 'CFO', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'EXITED', 'ON_LEAVE');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'PENDING_TRANSFER', 'UNDER_REPAIR', 'DISPOSED');

-- CreateEnum
CREATE TYPE "CustodianType" AS ENUM ('EMPLOYEE', 'DEPARTMENT', 'COMPANY', 'IT', 'FINANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "TransferKind" AS ENUM ('ADMIN_TRANSFER', 'EMPLOYEE_REQUEST');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('VALIDATING', 'READY', 'IMPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL,
    "employeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "permanentId" TEXT NOT NULL,
    "dynamicId" TEXT,
    "teamOfficeCode" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "personalEmail" TEXT,
    "fatherName" TEXT,
    "gender" "Gender",
    "dateOfBirth" TIMESTAMP(3),
    "pan" TEXT,
    "aadhaar" TEXT,
    "address1" TEXT,
    "address2" TEXT,
    "pinCode" TEXT,
    "state" TEXT,
    "bankHolderName" TEXT,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "ifscCode" TEXT,
    "pfEligible" BOOLEAN NOT NULL DEFAULT false,
    "pfAccountNumber" TEXT,
    "uanNumber" TEXT,
    "esicNumber" TEXT,
    "numberOfOutlets" INTEGER,
    "companyId" TEXT,
    "locationId" TEXT,
    "cityId" TEXT,
    "branchId" TEXT,
    "outletModelId" TEXT,
    "specialBranchCodeId" TEXT,
    "departmentId" TEXT,
    "employeeRoleId" TEXT,
    "designationId" TEXT,
    "costCentreId" TEXT,
    "status" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "joiningDate" TIMESTAMP(3),
    "exitDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "cityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutletModel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutletModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialBranchCode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialBranchCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Designation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Designation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCentre" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostCentre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeHistory" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeOtp" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "requestIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAsset" (
    "id" TEXT NOT NULL,
    "faId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "makeModel" TEXT,
    "serialNo" TEXT,
    "vendorName" TEXT,
    "invoiceNo" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "capitalisationDate" TIMESTAMP(3),
    "poGrnNo" TEXT,
    "locationId" TEXT,
    "departmentId" TEXT,
    "costCentreId" TEXT,
    "purchaseCost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "freight" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "installationCost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "otherCost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalCapitalisedCost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "itcEligible" BOOLEAN NOT NULL DEFAULT false,
    "itcAvailed" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "depreciationMethod" TEXT,
    "usefulLife" INTEGER,
    "residualValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "openingGrossBlock" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "additions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "disposals" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "closingGrossBlock" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "openingAccumDep" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "depreciationYear" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "accumDepDisposal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "closingAccumDep" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "netBookValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taxBlock" TEXT,
    "openingWdv" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taxAdditions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taxDisposals" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "wdvBeforeDepreciation" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "taxDepreciation" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "closingWdv" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "disposalDate" TIMESTAMP(3),
    "disposalMethod" TEXT,
    "saleProceeds" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "profitLossOnDisposal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "verificationDate" TIMESTAMP(3),
    "verificationStatus" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'AVAILABLE',
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetAssignment" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "custodianType" "CustodianType" NOT NULL,
    "employeeId" TEXT,
    "custodianName" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "AssetAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetTransfer" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "senderId" TEXT,
    "receiverId" TEXT NOT NULL,
    "kind" "TransferKind" NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "registeredDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetTransferEvent" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetTransferEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetQRCode" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetQRCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "email" TEXT,
    "role" "Role",
    "module" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "previousValue" JSONB,
    "newValue" JSONB,
    "metadata" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordVersion" (
    "id" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'VALIDATING',
    "filename" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportError" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "field" TEXT,
    "message" TEXT NOT NULL,
    "raw" JSONB,

    CONSTRAINT "ImportError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_permanentId_key" ON "Employee"("permanentId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_dynamicId_key" ON "Employee"("dynamicId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_phone_key" ON "Employee"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_personalEmail_key" ON "Employee"("personalEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_pan_key" ON "Employee"("pan");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_aadhaar_key" ON "Employee"("aadhaar");

-- CreateIndex
CREATE INDEX "Employee_name_idx" ON "Employee"("name");

-- CreateIndex
CREATE INDEX "Employee_phone_idx" ON "Employee"("phone");

-- CreateIndex
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");

-- CreateIndex
CREATE INDEX "Employee_cityId_idx" ON "Employee"("cityId");

-- CreateIndex
CREATE INDEX "Employee_status_idx" ON "Employee"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Company_code_key" ON "Company"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Location_name_key" ON "Location"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Location_code_key" ON "Location"("code");

-- CreateIndex
CREATE UNIQUE INDEX "City_name_key" ON "City"("name");

-- CreateIndex
CREATE UNIQUE INDEX "City_code_key" ON "City"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_name_key" ON "Branch"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

-- CreateIndex
CREATE UNIQUE INDEX "OutletModel_name_key" ON "OutletModel"("name");

-- CreateIndex
CREATE UNIQUE INDEX "OutletModel_code_key" ON "OutletModel"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SpecialBranchCode_name_key" ON "SpecialBranchCode"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SpecialBranchCode_code_key" ON "SpecialBranchCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeRole_name_key" ON "EmployeeRole"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeRole_code_key" ON "EmployeeRole"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Designation_name_key" ON "Designation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Designation_code_key" ON "Designation"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CostCentre_name_key" ON "CostCentre"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CostCentre_code_key" ON "CostCentre"("code");

-- CreateIndex
CREATE INDEX "EmployeeHistory_employeeId_createdAt_idx" ON "EmployeeHistory"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "EmployeeOtp_phone_expiresAt_idx" ON "EmployeeOtp"("phone", "expiresAt");

-- CreateIndex
CREATE INDEX "EmployeeOtp_requestIp_createdAt_idx" ON "EmployeeOtp"("requestIp", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAsset_faId_key" ON "FixedAsset"("faId");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAsset_serialNo_key" ON "FixedAsset"("serialNo");

-- CreateIndex
CREATE INDEX "FixedAsset_status_category_idx" ON "FixedAsset"("status", "category");

-- CreateIndex
CREATE INDEX "FixedAsset_locationId_idx" ON "FixedAsset"("locationId");

-- CreateIndex
CREATE INDEX "FixedAsset_departmentId_idx" ON "FixedAsset"("departmentId");

-- CreateIndex
CREATE INDEX "AssetAssignment_assetId_returnedAt_idx" ON "AssetAssignment"("assetId", "returnedAt");

-- CreateIndex
CREATE INDEX "AssetAssignment_employeeId_returnedAt_idx" ON "AssetAssignment"("employeeId", "returnedAt");

-- CreateIndex
CREATE INDEX "AssetTransfer_status_receiverId_idx" ON "AssetTransfer"("status", "receiverId");

-- CreateIndex
CREATE INDEX "AssetTransfer_senderId_createdAt_idx" ON "AssetTransfer"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "AssetTransfer_assetId_createdAt_idx" ON "AssetTransfer"("assetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssetQRCode_assetId_key" ON "AssetQRCode"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetQRCode_token_key" ON "AssetQRCode"("token");

-- CreateIndex
CREATE INDEX "AuditLog_recordType_recordId_createdAt_idx" ON "AuditLog"("recordType", "recordId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_module_createdAt_idx" ON "AuditLog"("module", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecordVersion_recordType_recordId_version_key" ON "RecordVersion"("recordType", "recordId", "version");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_outletModelId_fkey" FOREIGN KEY ("outletModelId") REFERENCES "OutletModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_specialBranchCodeId_fkey" FOREIGN KEY ("specialBranchCodeId") REFERENCES "SpecialBranchCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_employeeRoleId_fkey" FOREIGN KEY ("employeeRoleId") REFERENCES "EmployeeRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "Designation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_costCentreId_fkey" FOREIGN KEY ("costCentreId") REFERENCES "CostCentre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialBranchCode" ADD CONSTRAINT "SpecialBranchCode_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeHistory" ADD CONSTRAINT "EmployeeHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_costCentreId_fkey" FOREIGN KEY ("costCentreId") REFERENCES "CostCentre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransfer" ADD CONSTRAINT "AssetTransfer_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransfer" ADD CONSTRAINT "AssetTransfer_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransfer" ADD CONSTRAINT "AssetTransfer_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransferEvent" ADD CONSTRAINT "AssetTransferEvent_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "AssetTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetQRCode" ADD CONSTRAINT "AssetQRCode_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportError" ADD CONSTRAINT "ImportError_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Database-generated employee identifiers are concurrency-safe across every app instance.
CREATE SEQUENCE "employee_code_seq" START WITH 1 INCREMENT BY 1 NO CYCLE;
ALTER TABLE "Employee"
  ALTER COLUMN "permanentId"
  SET DEFAULT ('EMP' || lpad(nextval('"employee_code_seq"')::text, 4, '0'));

-- Domain constraints supplement the API validators and protect direct database writes.
ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_phone_format_check" CHECK ("phone" ~ '^\+91[6-9][0-9]{9}$'),
  ADD CONSTRAINT "Employee_pan_format_check" CHECK ("pan" IS NULL OR "pan" ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  ADD CONSTRAINT "Employee_aadhaar_format_check" CHECK ("aadhaar" IS NULL OR "aadhaar" ~ '^[2-9][0-9]{11}$'),
  ADD CONSTRAINT "Employee_pin_format_check" CHECK ("pinCode" IS NULL OR "pinCode" ~ '^[1-9][0-9]{5}$'),
  ADD CONSTRAINT "Employee_outlet_count_check" CHECK ("numberOfOutlets" IS NULL OR "numberOfOutlets" > 0);

ALTER TABLE "AssetTransfer"
  ADD CONSTRAINT "AssetTransfer_distinct_people_check" CHECK ("senderId" IS NULL OR "senderId" <> "receiverId"),
  ADD CONSTRAINT "AssetTransfer_effective_date_check" CHECK ("effectiveDate" IS NOT NULL);

CREATE UNIQUE INDEX "AssetAssignment_one_active_per_asset"
  ON "AssetAssignment" ("assetId")
  WHERE "returnedAt" IS NULL;

CREATE UNIQUE INDEX "AssetTransfer_one_pending_per_asset"
  ON "AssetTransfer" ("assetId")
  WHERE "status" = 'PENDING';

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

ALTER TABLE "User" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Employee" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Company" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Location" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "City" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Branch" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "OutletModel" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SpecialBranchCode" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Department" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "EmployeeRole" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Designation" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CostCentre" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "FixedAsset" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AssetTransfer" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE TRIGGER "User_set_updated_at" BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER "Employee_set_updated_at" BEFORE UPDATE ON "Employee" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER "Company_set_updated_at" BEFORE UPDATE ON "Company" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER "Location_set_updated_at" BEFORE UPDATE ON "Location" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER "City_set_updated_at" BEFORE UPDATE ON "City" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER "Branch_set_updated_at" BEFORE UPDATE ON "Branch" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER "OutletModel_set_updated_at" BEFORE UPDATE ON "OutletModel" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER "SpecialBranchCode_set_updated_at" BEFORE UPDATE ON "SpecialBranchCode" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER "Department_set_updated_at" BEFORE UPDATE ON "Department" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER "EmployeeRole_set_updated_at" BEFORE UPDATE ON "EmployeeRole" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER "Designation_set_updated_at" BEFORE UPDATE ON "Designation" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER "CostCentre_set_updated_at" BEFORE UPDATE ON "CostCentre" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER "FixedAsset_set_updated_at" BEFORE UPDATE ON "FixedAsset" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER "AssetTransfer_set_updated_at" BEFORE UPDATE ON "AssetTransfer" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION derive_employee_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  city_code TEXT;
  outlet_code TEXT;
  special_code TEXT;
  department_code TEXT;
  role_code TEXT;
BEGIN
  SELECT "code" INTO city_code FROM "City" WHERE "id" = NEW."cityId";
  SELECT "code" INTO outlet_code FROM "OutletModel" WHERE "id" = NEW."outletModelId";
  SELECT "code" INTO special_code FROM "SpecialBranchCode" WHERE "id" = NEW."specialBranchCodeId";
  SELECT "code" INTO department_code FROM "Department" WHERE "id" = NEW."departmentId";
  SELECT "code" INTO role_code FROM "EmployeeRole" WHERE "id" = NEW."employeeRoleId";

  IF city_code IS NULL OR outlet_code IS NULL OR special_code IS NULL
    OR NEW."numberOfOutlets" IS NULL OR department_code IS NULL OR role_code IS NULL THEN
    NEW."dynamicId" = NULL;
  ELSE
    NEW."dynamicId" =
      regexp_replace(upper(city_code), '[^A-Z0-9]', '', 'g') || '-' ||
      regexp_replace(upper(outlet_code), '[^A-Z0-9]', '', 'g') || '-' ||
      regexp_replace(upper(special_code), '[^A-Z0-9]', '', 'g') || '-' ||
      NEW."numberOfOutlets"::text || '-' ||
      regexp_replace(upper(department_code), '[^A-Z0-9]', '', 'g') || '-' ||
      regexp_replace(upper(role_code), '[^A-Z0-9]', '', 'g') || '-' ||
      lpad(substring(NEW."permanentId" from '([0-9]+)$'), 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Employee_derive_code"
BEFORE INSERT OR UPDATE OF "permanentId", "cityId", "outletModelId", "specialBranchCodeId", "numberOfOutlets", "departmentId", "employeeRoleId"
ON "Employee"
FOR EACH ROW EXECUTE FUNCTION derive_employee_code();

-- Supabase/PostgREST callers are denied by default. The server connection owns the
-- schema and bypasses RLS; authenticated clients receive only explicitly safe reads.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Employee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Location" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "City" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Branch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutletModel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpecialBranchCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Designation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CostCentre" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeOtp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FixedAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssetAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssetTransfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssetTransferEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssetQRCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecordVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportError" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  IF to_regprocedure('auth.role()') IS NOT NULL THEN
    FOREACH table_name IN ARRAY ARRAY[
      'Company', 'Location', 'City', 'Branch', 'OutletModel',
      'SpecialBranchCode', 'Department', 'EmployeeRole', 'Designation', 'CostCentre'
    ]
    LOOP
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (auth.role() = ''authenticated'')',
        table_name || '_authenticated_read',
        table_name
      );
    END LOOP;

    EXECUTE 'CREATE POLICY "Employee_self_read" ON "Employee" FOR SELECT TO authenticated USING (regexp_replace("phone", ''[^0-9]'', '''', ''g'') = regexp_replace(coalesce(auth.jwt() ->> ''phone'', ''''), ''[^0-9]'', '''', ''g''))';
    EXECUTE 'CREATE POLICY "Asset_self_read" ON "FixedAsset" FOR SELECT TO authenticated USING ("id" IN (SELECT aa."assetId" FROM "AssetAssignment" aa JOIN "Employee" employee ON employee."id" = aa."employeeId" WHERE aa."returnedAt" IS NULL AND regexp_replace(employee."phone", ''[^0-9]'', '''', ''g'') = regexp_replace(coalesce(auth.jwt() ->> ''phone'', ''''), ''[^0-9]'', '''', ''g'')))';
    EXECUTE 'CREATE POLICY "Assignment_self_read" ON "AssetAssignment" FOR SELECT TO authenticated USING ("employeeId" IN (SELECT "id" FROM "Employee" WHERE regexp_replace("phone", ''[^0-9]'', '''', ''g'') = regexp_replace(coalesce(auth.jwt() ->> ''phone'', ''''), ''[^0-9]'', '''', ''g'')))';
    EXECUTE 'CREATE POLICY "Transfer_self_read" ON "AssetTransfer" FOR SELECT TO authenticated USING ("senderId" IN (SELECT "id" FROM "Employee" WHERE regexp_replace("phone", ''[^0-9]'', '''', ''g'') = regexp_replace(coalesce(auth.jwt() ->> ''phone'', ''''), ''[^0-9]'', '''', ''g'')) OR "receiverId" IN (SELECT "id" FROM "Employee" WHERE regexp_replace("phone", ''[^0-9]'', '''', ''g'') = regexp_replace(coalesce(auth.jwt() ->> ''phone'', ''''), ''[^0-9]'', '''', ''g'')))';
    EXECUTE 'CREATE POLICY "Asset_qr_self_read" ON "AssetQRCode" FOR SELECT TO authenticated USING ("assetId" IN (SELECT aa."assetId" FROM "AssetAssignment" aa JOIN "Employee" employee ON employee."id" = aa."employeeId" WHERE aa."returnedAt" IS NULL AND regexp_replace(employee."phone", ''[^0-9]'', '''', ''g'') = regexp_replace(coalesce(auth.jwt() ->> ''phone'', ''''), ''[^0-9]'', '''', ''g'')))';
  END IF;
END;
$$;
