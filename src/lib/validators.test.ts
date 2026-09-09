import { describe, expect, it } from "vitest";
import { onboardingSchema, phoneSchema } from "./validators";

const validOnboarding = {
  phone: "9876543210",
  name: "Asha Rao",
  dateOfBirth: "1995-05-20",
  email: "asha@example.com",
  pan: "ABCDE1234F",
  aadhaar: "234567890123",
  address1: "12 Residency Road",
  address2: "",
  pinCode: "560001",
  state: "Karnataka",
};

describe("Indian employee validation", () => {
  it("normalizes a ten-digit mobile number to E.164", () => {
    expect(phoneSchema.parse("98765 43210")).toBe("+919876543210");
  });

  it("rejects non-Indian and invalid Indian mobile prefixes", () => {
    expect(phoneSchema.safeParse("+14155552671").success).toBe(false);
    expect(phoneSchema.safeParse("1234567890").success).toBe(false);
  });

  it("accepts a complete valid onboarding profile", () => {
    expect(onboardingSchema.safeParse(validOnboarding).success).toBe(true);
  });

  it.each([
    ["pan", "ABC123"],
    ["aadhaar", "123456789012"],
    ["pinCode", "012345"],
    ["state", "Not a state"],
  ])("rejects invalid %s", (field, value) => {
    expect(onboardingSchema.safeParse({ ...validOnboarding, [field]: value }).success).toBe(false);
  });
});
