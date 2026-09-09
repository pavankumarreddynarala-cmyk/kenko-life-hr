import { z } from "zod";

export const INDIAN_STATES_AND_UTS = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => {
    const digits = value.replace(/\D/g, "");
    const national = digits.length === 12 && digits.startsWith("91")
      ? digits.slice(2)
      : digits.length === 11 && digits.startsWith("0")
        ? digits.slice(1)
        : digits;
    return `+91${national}`;
  })
  .pipe(z.string().regex(/^\+91[6-9]\d{9}$/, "Enter a valid Indian mobile number"));

const optionalText = (max = 200) =>
  z.preprocess((value) => (value === "" || value === null ? undefined : value), z.string().trim().max(max).optional());
const optionalId = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.string().min(1).optional(),
);
const optionalDate = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.date().optional(),
);

export const onboardingSchema = z.object({
  phone: phoneSchema,
  name: z.string().trim().min(2).max(120),
  dateOfBirth: z.coerce.date().refine((date) => date < new Date(), "Date of birth must be in the past"),
  email: z.string().trim().email(),
  pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Enter a valid PAN"),
  aadhaar: z.string().transform((value) => value.replace(/\s/g, "")).pipe(z.string().regex(/^[2-9]\d{11}$/, "Enter a valid Aadhaar number")),
  address1: z.string().trim().min(3).max(200),
  address2: optionalText(200),
  pinCode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid Indian PIN code"),
  state: z.enum(INDIAN_STATES_AND_UTS),
});

export const employeeAdminSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  email: z.preprocess((value) => (value === "" || value === null ? undefined : value), z.string().email().optional()),
  personalEmail: z.preprocess((value) => (value === "" || value === null ? undefined : value), z.string().email().optional()),
  teamOfficeCode: optionalText(30),
  fatherName: optionalText(120),
  gender: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.enum(["FEMALE", "MALE", "NON_BINARY", "PREFER_NOT_TO_SAY"]).optional(),
  ),
  dateOfBirth: optionalDate,
  pan: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/).optional(),
  ),
  aadhaar: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.string().transform((input) => input.replace(/\s/g, "")).pipe(z.string().regex(/^[2-9]\d{11}$/)).optional(),
  ),
  address1: optionalText(200),
  address2: optionalText(200),
  pinCode: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.string().regex(/^[1-9][0-9]{5}$/).optional(),
  ),
  state: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.enum(INDIAN_STATES_AND_UTS).optional(),
  ),
  bankHolderName: optionalText(120),
  bankName: optionalText(120),
  accountNumber: optionalText(30),
  ifscCode: optionalText(20),
  pfEligible: z.preprocess(
    (value) => value === true || value === "true" || value === "yes" || value === 1,
    z.boolean(),
  ).default(false),
  pfAccountNumber: optionalText(40),
  uanNumber: optionalText(40),
  esicNumber: optionalText(40),
  numberOfOutlets: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().int().positive().max(999).optional(),
  ),
  companyId: optionalId,
  locationId: optionalId,
  cityId: optionalId,
  branchId: optionalId,
  outletModelId: optionalId,
  specialBranchCodeId: optionalId,
  departmentId: optionalId,
  employeeRoleId: optionalId,
  designationId: optionalId,
  costCentreId: optionalId,
  status: z.enum(["ACTIVE", "EXITED", "ON_LEAVE"]).default("ACTIVE"),
  joiningDate: optionalDate,
  exitDate: optionalDate,
});

export const transferRequestSchema = z.object({
  assetId: z.string().min(1),
  receiverEmployeeCode: z.string().trim().toUpperCase().regex(/^EMP\d{4,}$/),
  reason: optionalText(500),
  effectiveDate: optionalDate,
  registeredDate: optionalDate,
});

export const transferUpdateSchema = z.object({
  receiverEmployeeCode: z.string().trim().toUpperCase().regex(/^EMP\d{4,}$/).optional(),
  reason: optionalText(500),
  effectiveDate: optionalDate,
  registeredDate: optionalDate,
  action: z.enum(["ACCEPT", "REJECT", "REVOKE"]).optional(),
});
