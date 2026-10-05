import { describe, expect, it } from "vitest";
import { employeeAdminSchema, onboardingSchema, phoneSchema } from "./validators";
import { fieldError } from "./field-rules";

const validOnboarding = {
  phone: "9876543210",
  name: "Asha Rao",
  dateOfBirth: "1995-05-20",
  email: "asha@example.com",
  pan: "ABCPD1234E",
  aadhaar: "234567890123",
  address1: "12 Residency Road",
  address2: "",
  pinCode: "560001",
  state: "Karnataka",
};

describe("mobile (R6)", () => {
  it.each(["9876543210", "6300277087", "7000000000", "8123456789"])("accepts %s", (v) => {
    expect(phoneSchema.parse(v)).toBe(v);
  });
  it.each(["5876543210", "98765 43210", "+919876543210", "919876543210", "987654321", "98765432101", "98765abcde", "0987654321"])(
    "rejects %s",
    (v) => expect(phoneSchema.safeParse(v).success).toBe(false),
  );
});

describe("PAN (R5)", () => {
  it("accepts a valid PAN and upper-cases it", () => {
    const r = employeeAdminSchema.safeParse({ name: "Asha Rao", phone: "9876543210", pan: "abcpd1234e" });
    expect(r.success && r.data.pan).toBe("ABCPD1234E");
  });
  it.each(["ABCDE1234F", "ABCPD123E", "ABCPD12345", "ABCPD1234", "12CPD1234E", "ABCPD1234EE"])("rejects %s", (v) => {
    expect(employeeAdminSchema.safeParse({ name: "Asha Rao", phone: "9876543210", pan: v }).success).toBe(false);
    expect(fieldError("pan", v)).not.toBe("");
  });
});

describe("IFSC (R7)", () => {
  it("accepts and upper-cases", () => {
    const r = employeeAdminSchema.safeParse({ name: "Asha Rao", phone: "9876543210", ifscCode: "hdfc0001234" });
    expect(r.success && r.data.ifscCode).toBe("HDFC0001234");
    expect(fieldError("ifsc", "SBIN0A12B34")).toBe("");
  });
  it.each(["HDFC1001234", "HDF0001234", "HDFC000123", "HDFC00012345", "1234A001234", "HDFC0-01234"])("rejects %s", (v) => {
    expect(employeeAdminSchema.safeParse({ name: "Asha Rao", phone: "9876543210", ifscCode: v }).success).toBe(false);
  });
});

describe("UAN (R8)", () => {
  it("accepts 12 digits", () => {
    expect(employeeAdminSchema.safeParse({ name: "Asha Rao", phone: "9876543210", uanNumber: "100123456789" }).success).toBe(true);
  });
  it.each(["10012345678", "1001234567890", "10012345678a", "1001 2345 6789"])("rejects %s", (v) => {
    expect(employeeAdminSchema.safeParse({ name: "Asha Rao", phone: "9876543210", uanNumber: v }).success).toBe(false);
  });
});

describe("optional fields", () => {
  it("treat empty strings as not provided", () => {
    expect(
      employeeAdminSchema.safeParse({ name: "Asha Rao", phone: "9876543210", pan: "", ifscCode: "", uanNumber: "" }).success,
    ).toBe(true);
  });
});

describe("onboarding", () => {
  it("accepts a complete valid profile", () => {
    expect(onboardingSchema.safeParse(validOnboarding).success).toBe(true);
  });
  it.each([
    ["pan", "ABCDE1234F"],
    ["pan", "ABC123"],
    ["phone", "+919876543210"],
    ["aadhaar", "123456789012"],
    ["pinCode", "012345"],
    ["state", "Not a state"],
  ])("rejects invalid %s %s", (field, value) => {
    expect(onboardingSchema.safeParse({ ...validOnboarding, [field]: value }).success).toBe(false);
  });
});
