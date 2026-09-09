import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getVerifiedPhone, signPhoneVerification } from "./auth";

describe("phone verification proof", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret-that-is-longer-than-32-characters";
  });

  it("accepts only a signed phone verification token", () => {
    const token = signPhoneVerification("+919876543210");
    const request = new NextRequest("http://localhost/api/employee/self", {
      headers: { cookie: `kenko_phone_verified=${token}` },
    });
    expect(getVerifiedPhone(request)).toBe("+919876543210");
  });

  it("rejects a raw, forgeable phone cookie", () => {
    const request = new NextRequest("http://localhost/api/employee/self", {
      headers: { cookie: "kenko_phone_verified=%2B919876543210" },
    });
    expect(getVerifiedPhone(request)).toBeNull();
  });
});
