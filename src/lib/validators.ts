import { z } from "zod";
import "@/lib/zod-errors";

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
  .pipe(
    z
      .string()
      .regex(
        /^\+91[6-9]\d{9}$/,
        "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9 (for example 98765 43210). Remove any letters or symbols.",
      ),
  );

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().email("Enter a valid email address such as name@company.com."));

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const PAN_MESSAGE = "Enter a valid PAN: 5 letters, 4 digits, then 1 letter (for example ABCDE1234F).";
const AADHAAR_PATTERN = /^[2-9]\d{11}$/;
const AADHAAR_MESSAGE = "Enter a valid 12-digit Aadhaar number that does not start with 0 or 1.";
const PIN_PATTERN = /^[1-9][0-9]{5}$/;
const PIN_MESSAGE = "Enter a valid 6-digit Indian PIN code that does not start with 0.";
const STATE_MESSAGE = "Choose a state or union territory from the drop-down list.";

const blankToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

const optionalText = (max = 200) =>
  z.preprocess(
    blankToUndefined,
    z.string().trim().max(max, `Use at most ${max} characters — shorten the text.`).optional(),
  );
const optionalId = z.preprocess(blankToUndefined, z.string().min(1).optional());
const optionalDate = z.preprocess(blankToUndefined, z.coerce.date().optional());

export const onboardingSchema = z.object({
  phone: phoneSchema,
  name: z
    .string()
    .trim()
    .min(2, "Enter your full name as printed on your PAN card (at least 2 characters).")
    .max(120),
  dateOfBirth: z.coerce
    .date()
    .refine((date) => date < new Date(), "Date of birth must be a date in the past. Check the day, month and year."),
  email: z.string().trim().email("Enter a valid email address such as name@company.com."),
  pan: z.string().trim().toUpperCase().regex(PAN_PATTERN, PAN_MESSAGE),
  aadhaar: z
    .string()
    .transform((value) => value.replace(/\s/g, ""))
    .pipe(z.string().regex(AADHAAR_PATTERN, AADHAAR_MESSAGE)),
  address1: z.string().trim().min(3, "Enter your address (at least 3 characters).").max(200),
  address2: optionalText(200),
  pinCode: z.string().trim().regex(PIN_PATTERN, PIN_MESSAGE),
  state: z.enum(INDIAN_STATES_AND_UTS, { errorMap: () => ({ message: STATE_MESSAGE }) }),
});

export const employeeAdminSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter the employee's name as per PAN card (at least 2 characters).")
    .max(120),
  phone: phoneSchema,
  email: z.preprocess(
    blankToUndefined,
    z.string().trim().toLowerCase().email("Enter a valid work email such as name@company.com, or leave it blank.").optional(),
  ),
  personalEmail: z.preprocess(
    blankToUndefined,
    z.string().trim().toLowerCase().email("Enter a valid personal email such as name@gmail.com, or leave it blank.").optional(),
  ),
  teamOfficeCode: optionalText(30),
  fatherName: optionalText(120),
  gender: z.preprocess(
    blankToUndefined,
    z.enum(["FEMALE", "MALE", "NON_BINARY", "PREFER_NOT_TO_SAY"]).optional(),
  ),
  dateOfBirth: optionalDate,
  pan: z.preprocess(blankToUndefined, z.string().trim().toUpperCase().regex(PAN_PATTERN, PAN_MESSAGE).optional()),
  aadhaar: z.preprocess(
    blankToUndefined,
    z
      .string()
      .transform((input) => input.replace(/\s/g, ""))
      .pipe(z.string().regex(AADHAAR_PATTERN, AADHAAR_MESSAGE))
      .optional(),
  ),
  address1: optionalText(200),
  address2: optionalText(200),
  pinCode: z.preprocess(blankToUndefined, z.string().regex(PIN_PATTERN, PIN_MESSAGE).optional()),
  state: z.preprocess(
    blankToUndefined,
    z.enum(INDIAN_STATES_AND_UTS, { errorMap: () => ({ message: STATE_MESSAGE }) }).optional(),
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
    blankToUndefined,
    z.coerce
      .number({ invalid_type_error: "Enter the number of outlets using digits only." })
      .int("No. of outlets must be a whole number.")
      .positive("No. of outlets must be at least 1.")
      .max(999, "No. of outlets cannot be more than 999.")
      .optional(),
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

export const EMPLOYEE_CODE_MESSAGE =
  "Employee Code must be 2–20 characters using capital letters, digits and hyphens only (for example EMP0042).";

export const employeeCodeSchema = z
  .string({ required_error: "Enter an Employee Code (for example EMP0042)." })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, EMPLOYEE_CODE_MESSAGE);

const RECEIVER_REQUIRED = "Enter the Employee ID of the person who will receive the asset (for example EMP0042).";
const receiverCodeSchema = z
  .string({ required_error: RECEIVER_REQUIRED })
  .trim()
  .toUpperCase()
  .min(1, RECEIVER_REQUIRED)
  .regex(
    /^[A-Z0-9][A-Z0-9-]{1,19}$/,
    "The Receiving Employee ID is not in a valid format. Use the ID shown in the Employee Master (for example EMP0042).",
  );

export const transferRequestSchema = z.object({
  assetId: z.string({ required_error: "Choose the asset to transfer." }).min(1, "Choose the asset to transfer."),
  receiverEmployeeCode: receiverCodeSchema,
  reason: optionalText(500),
  effectiveDate: optionalDate,
  registeredDate: optionalDate,
});

export const transferUpdateSchema = z.object({
  receiverEmployeeCode: receiverCodeSchema.optional(),
  reason: optionalText(500),
  effectiveDate: optionalDate,
  registeredDate: optionalDate,
  action: z.enum(["ACCEPT", "REJECT", "REVOKE"]).optional(),
});

// Deleting a record (employee or asset) always needs a reason so the deletion history is
// meaningful to whoever reviews it later.
export const deleteRecordSchema = z.object({
  reason: z
    .string({ required_error: "Enter a reason for the deletion." })
    .trim()
    .min(3, "Enter a reason of at least 3 characters explaining why this record is being deleted.")
    .max(500, "The reason is too long. Keep it under 500 characters."),
});

export const loginSchema = z.object({
  email: z
    .string({ required_error: "Enter your email address." })
    .trim()
    .min(1, "Enter your email address.")
    .email("Enter a valid email address such as name@thekenkolife.com."),
  password: z.string({ required_error: "Enter your password." }).min(1, "Enter your password."),
});

export const PASSWORD_RULES =
  "Use at least 8 characters with at least one capital letter, one small letter and one digit.";

export const newPasswordSchema = z
  .string({ required_error: "Enter a new password." })
  .min(8, `The new password is too short. ${PASSWORD_RULES}`)
  .max(72, "The new password is too long. Use 72 characters or fewer.")
  .regex(/[A-Z]/, `The new password needs a capital letter. ${PASSWORD_RULES}`)
  .regex(/[a-z]/, `The new password needs a small letter. ${PASSWORD_RULES}`)
  .regex(/[0-9]/, `The new password needs a digit. ${PASSWORD_RULES}`);

export const changePasswordSchema = z.object({
  currentPassword: z.string({ required_error: "Enter your current password." }).min(1, "Enter your current password."),
  newPassword: newPasswordSchema,
  confirmPassword: z
    .string({ required_error: "Re-enter the new password to confirm it." })
    .min(1, "Re-enter the new password to confirm it."),
});
