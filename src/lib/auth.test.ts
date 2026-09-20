import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getVerifiedEmail, signEmailVerification } from "./auth";

describe("email verification proof", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret-that-is-longer-than-32-characters";
  });

  it("accepts only a signed email verification token", () => {
    const token = signEmailVerification("employee@example.test");
    const request = new NextRequest("http://localhost/api/employee/self", {
      headers: { cookie: `kenko_email_verified=${token}` },
    });
    expect(getVerifiedEmail(request)).toBe("employee@example.test");
  });

  it("rejects a raw, forgeable email cookie", () => {
    const request = new NextRequest("http://localhost/api/employee/self", {
      headers: { cookie: "kenko_email_verified=employee%40example.test" },
    });
    expect(getVerifiedEmail(request)).toBeNull();
  });
});
