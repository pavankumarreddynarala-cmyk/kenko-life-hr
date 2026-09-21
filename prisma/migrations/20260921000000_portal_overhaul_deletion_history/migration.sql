-- Management users get a display name for the sidebar profile block.
ALTER TABLE "User" ADD COLUMN     "name" TEXT;

-- Deletion history: who deleted an employee, and why (deletedAt already exists).
ALTER TABLE "Employee" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedByEmail" TEXT,
ADD COLUMN     "deletedById" TEXT;

-- Fixed assets are now soft-deleted with the same deletion history.
ALTER TABLE "FixedAsset" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByEmail" TEXT,
ADD COLUMN     "deletedById" TEXT;

CREATE INDEX "FixedAsset_deletedAt_idx" ON "FixedAsset"("deletedAt");
