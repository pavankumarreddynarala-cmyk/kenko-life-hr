-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "inviteTokenHash" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "invitedByEmail" TEXT,
    "legalName" TEXT,
    "tradeName" TEXT,
    "vendorType" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "address1" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pinCode" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "msmeNumber" TEXT,
    "website" TEXT,
    "bankHolderName" TEXT,
    "bankName" TEXT,
    "bankBranch" TEXT,
    "accountNumber" TEXT,
    "ifscCode" TEXT,
    "bankLocked" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SopDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "audience" TEXT NOT NULL DEFAULT 'TAGGED',
    "departmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "roleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "uploadedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SopDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "letterType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "uploadedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LetterTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterLog" (
    "id" TEXT NOT NULL,
    "templateId" TEXT,
    "templateName" TEXT NOT NULL,
    "letterType" TEXT NOT NULL,
    "employeeId" TEXT,
    "employeeCode" TEXT,
    "employeeName" TEXT,
    "action" TEXT NOT NULL,
    "sentTo" TEXT,
    "actorEmail" TEXT NOT NULL,
    "values" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LetterLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_email_key" ON "Vendor"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_inviteTokenHash_key" ON "Vendor"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "Vendor_status_idx" ON "Vendor"("status");

-- CreateIndex
CREATE INDEX "Vendor_createdAt_idx" ON "Vendor"("createdAt");

-- CreateIndex
CREATE INDEX "SopDocument_updatedAt_idx" ON "SopDocument"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LetterTemplate_name_key" ON "LetterTemplate"("name");

-- CreateIndex
CREATE INDEX "LetterLog_createdAt_idx" ON "LetterLog"("createdAt");

-- CreateIndex
CREATE INDEX "LetterLog_employeeId_idx" ON "LetterLog"("employeeId");

-- AddForeignKey
ALTER TABLE "LetterLog" ADD CONSTRAINT "LetterLog_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LetterTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

