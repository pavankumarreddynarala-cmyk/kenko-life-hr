-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('SLM', 'WDV');
CREATE TYPE "DisposalReason" AS ENUM ('SOLD', 'SCRAPPED', 'LOST', 'DAMAGED', 'WRITTEN_OFF', 'TRANSFERRED', 'OTHER');

-- AlterTable: depreciationMethod (free text) -> DepreciationMethod (enum).
-- Best-effort maps common existing text values; anything unrecognized becomes NULL
-- (the app then defaults to SLM behaviour, so nothing errors out downstream).
ALTER TABLE "FixedAsset" ADD COLUMN "depreciationMethod_new" "DepreciationMethod";
UPDATE "FixedAsset" SET "depreciationMethod_new" =
  CASE
    WHEN "depreciationMethod" ILIKE 'slm%' OR "depreciationMethod" ILIKE 'straight%' THEN 'SLM'::"DepreciationMethod"
    WHEN "depreciationMethod" ILIKE 'wdv%' OR "depreciationMethod" ILIKE 'written%' OR "depreciationMethod" ILIKE 'reducing%' THEN 'WDV'::"DepreciationMethod"
    ELSE NULL
  END;
ALTER TABLE "FixedAsset" DROP COLUMN "depreciationMethod";
ALTER TABLE "FixedAsset" RENAME COLUMN "depreciationMethod_new" TO "depreciationMethod";

-- AlterTable: disposalMethod (free text) -> disposalReason (enum) + disposalRemarks (free text).
-- The original free-text value is preserved verbatim in disposalRemarks so no data is lost,
-- and is also best-effort mapped onto the fixed disposalReason dropdown.
ALTER TABLE "FixedAsset" ADD COLUMN "disposalReason" "DisposalReason";
ALTER TABLE "FixedAsset" ADD COLUMN "disposalRemarks" TEXT;
UPDATE "FixedAsset" SET
  "disposalRemarks" = "disposalMethod",
  "disposalReason" =
    CASE
      WHEN "disposalMethod" ILIKE '%sold%' THEN 'SOLD'::"DisposalReason"
      WHEN "disposalMethod" ILIKE '%scrap%' OR "disposalMethod" ILIKE '%useless%' THEN 'SCRAPPED'::"DisposalReason"
      WHEN "disposalMethod" ILIKE '%lost%' THEN 'LOST'::"DisposalReason"
      WHEN "disposalMethod" ILIKE '%damag%' THEN 'DAMAGED'::"DisposalReason"
      WHEN "disposalMethod" ILIKE '%written%off%' OR "disposalMethod" ILIKE '%write%off%' THEN 'WRITTEN_OFF'::"DisposalReason"
      WHEN "disposalMethod" ILIKE '%transfer%' THEN 'TRANSFERRED'::"DisposalReason"
      WHEN "disposalMethod" IS NOT NULL THEN 'OTHER'::"DisposalReason"
      ELSE NULL
    END
WHERE "disposalMethod" IS NOT NULL;
ALTER TABLE "FixedAsset" DROP COLUMN "disposalMethod";
