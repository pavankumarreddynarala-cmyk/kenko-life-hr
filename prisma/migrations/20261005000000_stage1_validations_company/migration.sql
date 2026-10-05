-- Stage 1 (R4-R9): employee code series, identifier validation, company master.

-- R4: Employee Code is now "highest existing number + 1", allocated by the application inside a
-- transaction (advisory lock). The database default and sequence are retired so nothing else can
-- hand out numbers outside the series.
ALTER TABLE "Employee" ALTER COLUMN "permanentId" DROP DEFAULT;
DROP SEQUENCE IF EXISTS "employee_code_seq";

-- R6: mobile numbers are stored as the bare 10-digit number (no +91).
ALTER TABLE "Employee" DROP CONSTRAINT IF EXISTS "Employee_phone_format_check";
UPDATE "Employee" SET "phone" = right(regexp_replace("phone", '[^0-9]', '', 'g'), 10);
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_phone_format_check" CHECK ("phone" ~ '^[6-9][0-9]{9}$') NOT VALID;

-- R5: PAN 4th character must be P (individual).
ALTER TABLE "Employee" DROP CONSTRAINT IF EXISTS "Employee_pan_format_check";
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_pan_format_check" CHECK ("pan" IS NULL OR "pan" ~ '^[A-Z]{3}P[A-Z][0-9]{4}[A-Z]$') NOT VALID;

-- R7 / R8: IFSC and UAN formats.
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_ifsc_format_check" CHECK ("ifscCode" IS NULL OR "ifscCode" ~ '^[A-Z]{4}0[A-Z0-9]{6}$') NOT VALID;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_uan_format_check" CHECK ("uanNumber" IS NULL OR "uanNumber" ~ '^[0-9]{12}$') NOT VALID;

-- R10: an exit date only makes sense for exited employees and cannot precede joining.
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_exit_after_joining_check" CHECK ("exitDate" IS NULL OR "joiningDate" IS NULL OR "exitDate" >= "joiningDate") NOT VALID;

-- R9: companies can be deactivated instead of deleted.
ALTER TABLE "Company" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- R3: list ordering.
CREATE INDEX "Employee_createdAt_idx" ON "Employee"("createdAt");
