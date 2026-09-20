-- CreateTable
CREATE TABLE "CustomMasterType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomMasterType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomMasterValue" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomMasterValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomMasterType_name_key" ON "CustomMasterType"("name");
CREATE UNIQUE INDEX "CustomMasterType_code_key" ON "CustomMasterType"("code");
CREATE INDEX "CustomMasterValue_typeId_idx" ON "CustomMasterValue"("typeId");
CREATE UNIQUE INDEX "CustomMasterValue_typeId_code_key" ON "CustomMasterValue"("typeId", "code");

-- AddForeignKey
ALTER TABLE "CustomMasterValue" ADD CONSTRAINT "CustomMasterValue_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "CustomMasterType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: same posture as every other table (server owner connection bypasses RLS; direct
-- PostgREST/Supabase-client reads get an authenticated-only read policy).
ALTER TABLE "CustomMasterType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomMasterValue" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regprocedure('auth.role()') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY "CustomMasterType_authenticated_read" ON "CustomMasterType" FOR SELECT TO authenticated USING (auth.role() = ''authenticated'')';
    EXECUTE 'CREATE POLICY "CustomMasterValue_authenticated_read" ON "CustomMasterValue" FOR SELECT TO authenticated USING (auth.role() = ''authenticated'')';
  END IF;
END;
$$;
