// Starting values for the depreciation masters. These are PLACEHOLDERS (verified = false): Schedule II
// lives and Income Tax block rates must be confirmed by the firm and corrected on the setup screen.
export const DEFAULT_TAX_BLOCKS = [
  { name: "Computers & software", rate: 40 },
  { name: "Plant & machinery (general)", rate: 15 },
  { name: "Furniture & fittings", rate: 10 },
  { name: "Motor cars", rate: 15 },
  { name: "Buildings (general)", rate: 10 },
  { name: "Intangible assets", rate: 25 },
] as const;

export const DEFAULT_ASSET_CATEGORIES = [
  { name: "Laptop", usefulLifeYears: 3, defaultTaxBlock: "Computers & software" },
  { name: "Desktop / Computer", usefulLifeYears: 3, defaultTaxBlock: "Computers & software" },
  { name: "Servers & Networking", usefulLifeYears: 6, defaultTaxBlock: "Computers & software" },
  { name: "Office Equipment", usefulLifeYears: 5, defaultTaxBlock: "Plant & machinery (general)" },
  { name: "Furniture & Fittings", usefulLifeYears: 10, defaultTaxBlock: "Furniture & fittings" },
  { name: "Plant & Machinery", usefulLifeYears: 15, defaultTaxBlock: "Plant & machinery (general)" },
  { name: "Electrical Installations", usefulLifeYears: 10, defaultTaxBlock: "Plant & machinery (general)" },
  { name: "Motor Car", usefulLifeYears: 8, defaultTaxBlock: "Motor cars" },
  { name: "Two Wheeler", usefulLifeYears: 10, defaultTaxBlock: "Motor cars" },
  { name: "Building (RCC)", usefulLifeYears: 60, defaultTaxBlock: "Buildings (general)" },
] as const;

import type { PrismaClient } from "@prisma/client";

/** Inserts the placeholders only when the masters are empty. Returns how many rows were added. */
export async function seedDepreciationMasters(client: PrismaClient) {
  let added = 0;
  if ((await client.taxBlock.count()) === 0) {
    await client.taxBlock.createMany({ data: DEFAULT_TAX_BLOCKS.map((b) => ({ ...b, verified: false })) });
    added += DEFAULT_TAX_BLOCKS.length;
  }
  if ((await client.assetCategory.count()) === 0) {
    await client.assetCategory.createMany({ data: DEFAULT_ASSET_CATEGORIES.map((c) => ({ ...c, residualPercent: 5, method: "SLM", verified: false })) });
    added += DEFAULT_ASSET_CATEGORIES.length;
  }
  return added;
}
