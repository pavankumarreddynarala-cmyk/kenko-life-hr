-- AlterTable: stage validated rows on ImportBatch so "validate" and "confirm" can be
-- two separate steps, per the required review-before-import flow.
ALTER TABLE "ImportBatch" ADD COLUMN "totalRows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportBatch" ADD COLUMN "validCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportBatch" ADD COLUMN "errorCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportBatch" ADD COLUMN "payload" JSONB;
ALTER TABLE "ImportBatch" ADD COLUMN "createdBy" TEXT;
