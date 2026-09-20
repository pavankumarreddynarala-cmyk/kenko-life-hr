-- AlterEnum
-- CEO, COO, HR and CFO are management-tier aliases with the same permissions as ADMIN.
-- Only EMPLOYEE remains restricted to the Employee Portal (own data only).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CEO';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'COO';

-- AlterTable
-- Soft delete for Employee Master (Edit/Delete/Undo requirement). Deleted records are
-- kept for audit/restore, never hard-deleted, and are excluded from default listings.
ALTER TABLE "Employee" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Employee_deletedAt_idx" ON "Employee"("deletedAt");

-- AlterTable
-- Employee Portal authentication moves from mobile OTP to email OTP.
ALTER TABLE "EmployeeOtp" RENAME COLUMN "phone" TO "email";
DROP INDEX IF EXISTS "EmployeeOtp_phone_expiresAt_idx";
CREATE INDEX "EmployeeOtp_email_expiresAt_idx" ON "EmployeeOtp"("email", "expiresAt");

-- Re-key the Supabase RLS self-read policies from the phone JWT claim to the email JWT
-- claim to match the new email-based employee identity. These only affect direct
-- PostgREST/Supabase-client reads; the Next.js server always uses the owner connection
-- (via Prisma) and enforces authorization again in application code regardless.
DO $$
BEGIN
  IF to_regprocedure('auth.role()') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Employee_self_read" ON "Employee";
    DROP POLICY IF EXISTS "Asset_self_read" ON "FixedAsset";
    DROP POLICY IF EXISTS "Assignment_self_read" ON "AssetAssignment";
    DROP POLICY IF EXISTS "Transfer_self_read" ON "AssetTransfer";
    DROP POLICY IF EXISTS "Asset_qr_self_read" ON "AssetQRCode";

    EXECUTE 'CREATE POLICY "Employee_self_read" ON "Employee" FOR SELECT TO authenticated USING (lower("email") = lower(coalesce(auth.jwt() ->> ''email'', '''')) AND "email" IS NOT NULL)';
    EXECUTE 'CREATE POLICY "Asset_self_read" ON "FixedAsset" FOR SELECT TO authenticated USING ("id" IN (SELECT aa."assetId" FROM "AssetAssignment" aa JOIN "Employee" employee ON employee."id" = aa."employeeId" WHERE aa."returnedAt" IS NULL AND employee."email" IS NOT NULL AND lower(employee."email") = lower(coalesce(auth.jwt() ->> ''email'', ''''))))';
    EXECUTE 'CREATE POLICY "Assignment_self_read" ON "AssetAssignment" FOR SELECT TO authenticated USING ("employeeId" IN (SELECT "id" FROM "Employee" WHERE "email" IS NOT NULL AND lower("email") = lower(coalesce(auth.jwt() ->> ''email'', ''''))))';
    EXECUTE 'CREATE POLICY "Transfer_self_read" ON "AssetTransfer" FOR SELECT TO authenticated USING ("senderId" IN (SELECT "id" FROM "Employee" WHERE "email" IS NOT NULL AND lower("email") = lower(coalesce(auth.jwt() ->> ''email'', ''''))) OR "receiverId" IN (SELECT "id" FROM "Employee" WHERE "email" IS NOT NULL AND lower("email") = lower(coalesce(auth.jwt() ->> ''email'', ''''))))';
    EXECUTE 'CREATE POLICY "Asset_qr_self_read" ON "AssetQRCode" FOR SELECT TO authenticated USING ("assetId" IN (SELECT aa."assetId" FROM "AssetAssignment" aa JOIN "Employee" employee ON employee."id" = aa."employeeId" WHERE aa."returnedAt" IS NULL AND employee."email" IS NOT NULL AND lower(employee."email") = lower(coalesce(auth.jwt() ->> ''email'', ''''))))';
  END IF;
END;
$$;
