import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { extractFields, employeeLetterValues, renderTemplate } from "@/lib/letters";
import { sopFieldsSchema, sopVisibleTo } from "@/lib/sops";
import { vendorSubmitSchema, vendorPatchSchema } from "@/lib/vendors";

const valid = {
  legalName: "Sri Sai Traders", vendorType: "Goods supplier", contactPerson: "Ravi", phone: "9876543210",
  address1: "1-2-3 Main Road", city: "Hyderabad", state: "Telangana", pinCode: "500001",
  pan: "AABCS1234F", gstin: "36AABCS1234F1Z5", bankHolderName: "Sri Sai Traders", bankName: "HDFC Bank", accountNumber: "123456789012", ifscCode: "HDFC0001234",
};

describe("vendor validation", () => {
  it("accepts a complete submission", () => expect(vendorSubmitSchema.safeParse(valid).success).toBe(true));
  it("accepts a business PAN (4th letter F) that an employee PAN would refuse", () => expect(vendorSubmitSchema.safeParse({ ...valid, pan: "AABCS1234F" }).success).toBe(true));
  it("rejects a GSTIN whose PAN does not match", () => {
    const r = vendorSubmitSchema.safeParse({ ...valid, gstin: "36AAAAA1111A1Z5" });
    expect(r.success).toBe(false);
  });
  it("allows blank GSTIN (not registered)", () => expect(vendorSubmitSchema.safeParse({ ...valid, gstin: "" }).success).toBe(true));
  it.each([["phone", "12345"], ["pinCode", "012345"], ["accountNumber", "123"], ["ifscCode", "HDFC1234567"], ["pan", "1234567890"]])("rejects bad %s", (key, value) =>
    expect(vendorSubmitSchema.safeParse({ ...valid, [key]: value }).success).toBe(false));
  it("requires bank details on first submission", () => {
    const { ifscCode, ...rest } = valid;
    void ifscCode;
    expect(vendorSubmitSchema.safeParse(rest).success).toBe(false);
  });
  it("patch accepts a subset", () => expect(vendorPatchSchema.safeParse({ city: "Pune" }).success).toBe(true));
});

describe("SOP visibility (R16)", () => {
  const dept = { audience: "TAGGED", departmentIds: ["d1"], roleIds: [] };
  it("division-tagged SOP is visible only to that division", () => {
    expect(sopVisibleTo(dept, { departmentId: "d1", employeeRoleId: "r9" })).toBe(true);
    expect(sopVisibleTo(dept, { departmentId: "d2", employeeRoleId: "r9" })).toBe(false);
    expect(sopVisibleTo(dept, { departmentId: null, employeeRoleId: null })).toBe(false);
  });
  it("role tag works, and changing the tag changes who sees it", () => {
    const role = { audience: "TAGGED", departmentIds: [], roleIds: ["r1"] };
    expect(sopVisibleTo(role, { departmentId: "d2", employeeRoleId: "r1" })).toBe(true);
    expect(sopVisibleTo({ ...role, roleIds: ["r2"] }, { departmentId: "d2", employeeRoleId: "r1" })).toBe(false);
  });
  it("ALL is seen by everyone", () => expect(sopVisibleTo({ audience: "ALL", departmentIds: [], roleIds: [] }, { departmentId: null, employeeRoleId: null })).toBe(true));
  it("TAGGED with nothing picked is refused", () => expect(sopFieldsSchema.safeParse({ title: "Leave policy", audience: "TAGGED", departmentIds: "[]", roleIds: "[]" }).success).toBe(false));
});

describe("letter templates (R17)", () => {
  const offer = readFileSync("docs/sample-letter-templates/sample-offer-letter.docx");
  it("finds fields in body, header and footer text", () => {
    const fields = extractFields(offer);
    expect(fields).toEqual(expect.arrayContaining(["letter_date", "employee_code", "salutation", "employee_name", "designation", "department", "company_name", "joining_date", "annual_ctc", "work_location"]));
  });
  it("fills the template and keeps it a valid docx", () => {
    const out = renderTemplate(offer, { employee_name: "Asha Rao", designation: "Manager" });
    expect(out.subarray(0, 2).toString()).toBe("PK");
    expect(extractFields(out)).toEqual([]); // nothing left unfilled
  });
  it("escapes special characters", () => {
    expect(() => renderTemplate(offer, { employee_name: "A & B <C>" })).not.toThrow();
  });
  it("maps Employee Master values", () => {
    const v = employeeLetterValues({
      name: "Asha Rao", permanentId: "EMP0007", gender: "FEMALE", fatherName: null, email: "a@k.com", personalEmail: null, phone: "9876543210",
      address1: "1 Road", address2: "Area", pinCode: "500001", state: "Telangana", joiningDate: new Date("2024-04-01T00:00:00Z"), exitDate: null, dateOfBirth: null,
      department: { name: "Finance" }, designation: { name: "Manager" }, employeeRole: null, company: { name: "Kenko Life" }, city: { name: "Hyderabad" },
    }, new Date("2026-10-06T00:00:00Z"));
    expect(v).toMatchObject({ salutation: "Ms.", employee_code: "EMP0007", joining_date: "1 April 2024", address: "1 Road, Area", letter_date: "6 October 2026", last_working_day: "" });
  });
  it("rejects a broken template with a clear message", () => {
    expect(() => extractFields(Buffer.from("not a docx"))).toThrow(/cannot be used as a template/);
  });
});
