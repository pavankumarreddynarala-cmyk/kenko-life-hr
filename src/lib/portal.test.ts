import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { permissionsFor, isManagementRole, nameFromEmail, roleLabel } from "./permissions";
import { describeAudit } from "./audit-summary";
import { describeMissing, requiredErrors } from "./form-validation";
import { assetSchema, itcIssue, assertItcRule, ITC_NOT_ELIGIBLE_MESSAGE } from "./assets";
import { changePasswordSchema, deleteRecordSchema, employeeAdminSchema, employeeCodeSchema, onboardingSchema } from "./validators";
import { describeUsage } from "./masters";
import { summariseIssues, zodFieldIssues } from "./zod-errors";

describe("role permissions", () => {
  it("treats every management role as management and EMPLOYEE as not", () => {
    for (const role of ["ADMIN", "CEO", "COO", "HR", "CFO"]) expect(isManagementRole(role)).toBe(true);
    expect(isManagementRole("EMPLOYEE")).toBe(false);
  });

  it("limits code edits, asset deletion and master deletion to Admin, CEO and COO", () => {
    for (const role of ["ADMIN", "CEO", "COO"]) {
      expect(permissionsFor(role)).toMatchObject({ editEmployeeCode: true, deleteAsset: true, restoreAsset: true, deleteMasterData: true });
    }
    for (const role of ["HR", "CFO"]) {
      expect(permissionsFor(role)).toMatchObject({ editEmployeeCode: false, deleteAsset: false, deleteMasterData: false, editMasterData: true });
    }
    expect(permissionsFor("EMPLOYEE")).toMatchObject({ editMasterData: false, deleteAsset: false });
  });

  it("derives a readable name and role label", () => {
    expect(nameFromEmail("Accounts@thekenkolife.com")).toBe("Accounts");
    expect(nameFromEmail("priya.shah@x.com")).toBe("Priya Shah");
    expect(roleLabel("CFO")).toBe("CFO");
    expect(roleLabel("ADMIN")).toBe("Admin");
  });
});

describe("actionable validation messages", () => {
  function issuesFor(schema: { safeParse: (value: unknown) => { success: boolean; error?: ZodError } }, value: unknown) {
    const result = schema.safeParse(value);
    expect(result.success).toBe(false);
    return zodFieldIssues(result.error as ZodError);
  }

  it("names the field and says what to do instead of 'Invalid input'", () => {
    const issues = issuesFor(employeeAdminSchema, { name: "A", phone: "12345" });
    const byField = Object.fromEntries(issues.map((issue) => [issue.field, issue]));
    expect(byField.name.label).toBe("Name");
    expect(byField.name.message).toMatch(/at least 2 characters/);
    expect(byField.phone.label).toBe("Mobile number");
    expect(byField.phone.message).toMatch(/10-digit Indian mobile number/);
    for (const issue of issues) expect(issue.message).not.toMatch(/^(Invalid|Required)$/);
  });

  it("explains a missing required value", () => {
    const issues = issuesFor(onboardingSchema, {});
    expect(issues.find((issue) => issue.field === "pan")?.message).toMatch(/required/i);
    expect(summariseIssues(issues)).toMatch(/fields need attention/);
  });

  it("gives PAN and Aadhaar format guidance", () => {
    const issues = issuesFor(employeeAdminSchema, { name: "Asha Rao", phone: "9876543210", pan: "abc", aadhaar: "1234" });
    expect(issues.find((issue) => issue.field === "pan")?.message).toMatch(/ABCDE1234F/);
    expect(issues.find((issue) => issue.field === "aadhaar")?.message).toMatch(/12-digit/);
  });

  it("asks for a reason when deleting", () => {
    expect(issuesFor(deleteRecordSchema, { reason: "" })[0].message).toMatch(/reason/i);
    expect(deleteRecordSchema.safeParse({ reason: "Created by mistake" }).success).toBe(true);
  });

  it("enforces the password policy with specific guidance", () => {
    const weak = issuesFor(changePasswordSchema, { currentPassword: "x", newPassword: "short", confirmPassword: "short" });
    expect(weak.find((issue) => issue.field === "newPassword")?.message).toMatch(/too short/);
    expect(changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "Str0ngPass", confirmPassword: "Str0ngPass" }).success).toBe(true);
  });
});

describe("Employee Code format", () => {
  it("normalises to upper case and accepts hyphenated codes", () => {
    expect(employeeCodeSchema.parse(" emp0042 ")).toBe("EMP0042");
    expect(employeeCodeSchema.parse("kl-001")).toBe("KL-001");
  });

  it("rejects spaces, symbols and one-character codes", () => {
    for (const bad of ["EMP 42", "EMP/42", "E", "-EMP1", ""]) expect(employeeCodeSchema.safeParse(bad).success).toBe(false);
  });
});

describe("mandatory field check", () => {
  it("flags only the blank required fields", () => {
    const errors = requiredErrors({ name: "  ", phone: "9876543210", email: "" }, ["name", "phone"], { name: "Name" });
    expect(Object.keys(errors)).toEqual(["name"]);
    expect(errors.name).toMatch(/Name is required/);
    expect(describeMissing(errors, { name: "Name" })).toBe("Name");
  });

  it("treats zero and false as filled in", () => {
    expect(requiredErrors({ count: 0, flag: false }, ["count", "flag"])).toEqual({});
  });
});

describe("ITC eligibility rule", () => {
  it("rejects an ITC amount when the asset is not eligible", () => {
    expect(itcIssue({ itcEligible: false, itcAvailed: 500 })?.message).toBe(ITC_NOT_ELIGIBLE_MESSAGE);
  });

  it("allows an amount when eligible, and zero or blank when not", () => {
    expect(itcIssue({ itcEligible: true, itcAvailed: 500 })).toBeNull();
    expect(itcIssue({ itcEligible: false, itcAvailed: 0 })).toBeNull();
    expect(itcIssue({ itcEligible: false, itcAvailed: null })).toBeNull();
    expect(itcIssue({ itcEligible: false, itcAvailed: { toNumber: () => 0 } })).toBeNull();
  });

  it("checks the record as it will look after an edit, and only when ITC fields are touched", () => {
    const existing = { itcEligible: true, itcAvailed: { toNumber: () => 1800 } };
    // Flipping to "not eligible" without clearing the amount is refused…
    expect(() => assertItcRule(existing, { itcEligible: false })).toThrow(ITC_NOT_ELIGIBLE_MESSAGE);
    // …clearing it in the same edit is fine…
    expect(() => assertItcRule(existing, { itcEligible: false, itcAvailed: 0 })).not.toThrow();
    // …and an unrelated edit to a legacy row is never blocked.
    expect(() => assertItcRule({ itcEligible: false, itcAvailed: 900 }, { description: "New description" })).not.toThrow();
  });

  it("reports the failure against the ITC field", () => {
    try {
      assertItcRule({}, { itcEligible: false, itcAvailed: 10 });
      throw new Error("expected assertItcRule to throw");
    } catch (error) {
      expect(error).toMatchObject({ status: 400, fields: [{ field: "itcAvailed" }] });
    }
  });

  it("still requires the mandatory asset fields", () => {
    const result = assetSchema.safeParse({ faId: "", category: "", description: "" });
    expect(result.success).toBe(false);
  });
});

describe("master data usage text", () => {
  it("lists what uses an entry", () => {
    expect(describeUsage("location", { employees: 12, assets: 3 })).toBe("12 employee(s) and 3 asset(s)");
    expect(describeUsage("city", { branches: 2, employees: 0 })).toBe("2 branch(es)");
    expect(describeUsage("designation", { employees: 0 })).toBe("");
    expect(describeUsage("costCentre", undefined)).toBe("");
  });
});

describe("dashboard activity wording", () => {
  const base = { id: "1", createdAt: new Date().toISOString(), module: "EMPLOYEE", recordType: "Employee", recordId: "cuid1" };

  it("describes an employee being added, by whom", () => {
    const line = describeAudit({
      ...base,
      action: "CREATED",
      email: "roshini@thekenkolife.com",
      role: "CFO",
      newValue: { permanentId: "EMP0248", name: "Priya Shah" },
    });
    expect(line.actor).toBe("Roshini (CFO)");
    expect(line.text).toBe("added employee EMP0248 · Priya Shah");
    expect(line.tone).toBe("success");
  });

  it("includes the deletion reason and flags it as a warning", () => {
    const line = describeAudit({
      ...base,
      recordType: "FixedAsset",
      module: "ASSET",
      action: "DELETED",
      email: "admin@thekenkolife.com",
      role: "ADMIN",
      previousValue: { faId: "FA000121", description: "Laptop" },
      reason: "Created by mistake",
    });
    expect(line.text).toBe("deleted asset FA000121 · Laptop — reason: Created by mistake");
    expect(line.tone).toBe("warning");
  });

  it("uses transfer lookups for transfer events", () => {
    const line = describeAudit(
      { ...base, module: "ASSET", recordType: "AssetTransfer", recordId: "t1", action: "ACCEPTED", email: "a@b.com", role: "EMPLOYEE" },
      new Map([["t1", { faId: "FA000009", receiver: "EMP0034 · Ravi" }]]),
    );
    expect(line.text).toContain("FA000009");
  });

  it("does not repeat the role when it is the same word as the name", () => {
    const admin = describeAudit({ ...base, module: "AUTH", recordType: "User", action: "LOGIN_SUCCESS", email: "admin@thekenkolife.com", role: "ADMIN" });
    const coo = describeAudit({ ...base, module: "AUTH", recordType: "User", action: "LOGIN_SUCCESS", email: "coo@thekenkolife.com", role: "COO" });
    expect(admin.actor).toBe("Admin");
    expect(coo.actor).toBe("Coo");
  });

  it("flags failed sign-ins as security events", () => {
    const line = describeAudit({ ...base, module: "AUTH", recordType: "User", recordId: "x@y.com", action: "LOGIN_FAILED" });
    expect(line).toMatchObject({ actor: "Security", tone: "warning" });
  });

  it("never returns an empty sentence for an unknown action", () => {
    const line = describeAudit({ ...base, module: "SOMETHING", recordType: "Widget", action: "FROBNICATED" });
    expect(line.text).toBe("frobnicated · Widget");
  });
});
