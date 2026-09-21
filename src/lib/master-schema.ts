import { z } from "zod";
import "@/lib/zod-errors";

const nameField = z
  .string({ required_error: "Enter a name." })
  .trim()
  .min(2, "Enter a name of at least 2 characters.")
  .max(120, "The name is too long. Use 120 characters or fewer.");

const codeMessage =
  "Code must be 2–20 characters using capital letters, digits or hyphens only (for example BLR-01).";

// Standard masters and custom master types: 2–20 character codes.
export const masterSchema = z.object({
  name: nameField,
  code: z
    .string({ required_error: "Enter a unique code." })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/, codeMessage),
});

// Values inside a custom master may use single-character codes.
export const customValueSchema = z.object({
  name: z
    .string({ required_error: "Enter a name." })
    .trim()
    .min(1, "Enter a name for this value.")
    .max(120, "The name is too long. Use 120 characters or fewer."),
  code: z
    .string({ required_error: "Enter a unique code." })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{1,20}$/, "Code must be 1–20 characters using capital letters, digits or hyphens only (for example NIGHT)."),
});
