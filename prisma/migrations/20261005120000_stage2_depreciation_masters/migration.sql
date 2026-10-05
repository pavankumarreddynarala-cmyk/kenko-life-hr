-- Stage 2 (R11, R13): depreciation masters and app settings.
CREATE TABLE "AssetCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "usefulLifeYears" INTEGER NOT NULL,
    "residualPercent" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "method" TEXT NOT NULL DEFAULT 'SLM',
    "defaultTaxBlock" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetCategory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AssetCategory_life_check" CHECK ("usefulLifeYears" > 0),
    CONSTRAINT "AssetCategory_residual_check" CHECK ("residualPercent" >= 0 AND "residualPercent" <= 100)
);
CREATE UNIQUE INDEX "AssetCategory_name_key" ON "AssetCategory"("name");

CREATE TABLE "TaxBlock" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaxBlock_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TaxBlock_rate_check" CHECK ("rate" >= 0 AND "rate" <= 100)
);
CREATE UNIQUE INDEX "TaxBlock_name_key" ON "TaxBlock"("name");

CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

CREATE TRIGGER "AssetCategory_set_updated_at" BEFORE UPDATE ON "AssetCategory" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER "TaxBlock_set_updated_at" BEFORE UPDATE ON "TaxBlock" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER "AppSetting_set_updated_at" BEFORE UPDATE ON "AppSetting" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Server-only tables, like the rest of the schema.
ALTER TABLE "AssetCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaxBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppSetting" ENABLE ROW LEVEL SECURITY;

-- Asset lookups by capitalisation date (depreciation) and category.
CREATE INDEX "FixedAsset_capitalisationDate_idx" ON "FixedAsset"("capitalisationDate");
