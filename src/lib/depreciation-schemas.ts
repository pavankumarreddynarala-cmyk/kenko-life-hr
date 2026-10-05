import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  usefulLifeYears: z.coerce.number().int().min(1).max(100),
  residualPercent: z.coerce.number().min(0).max(100).default(5),
  defaultTaxBlock: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(100).nullable().optional()),
  verified: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const blockSchema = z.object({
  name: z.string().trim().min(2).max(100),
  rate: z.coerce.number().min(0).max(100),
  verified: z.boolean().optional(),
  active: z.boolean().optional(),
});
