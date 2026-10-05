import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseUser, sendEmailMagicLink, SupabaseAuthError } from "./email-auth";

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://kenko.supabase.co");
  vi.stubEnv("SUPABASE_ANON_KEY", "valid-anon-key");
  vi.stubEnv("APP_URL", "https://hr.example.com");
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Supabase email authentication", () => {
  it("requests a magic link with the employee redirect", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    await sendEmailMagicLink("employee@example.com");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://kenko.supabase.co/auth/v1/otp?redirect_to=https%3A%2F%2Fhr.example.com%2Femployee",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "employee@example.com", create_user: true }),
      }),
    );
  });

  it("accepts only a confirmed Supabase email identity", async () => {
    const accessToken = [
      "header",
      Buffer.from(JSON.stringify({
        sub: "supabase-user-1",
        amr: [{ method: "magiclink" }],
      })).toString("base64url"),
      "signature",
    ].join(".");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        id: "supabase-user-1",
        email: "Employee@Example.com",
        email_confirmed_at: "2026-09-09T00:00:00Z",
      }),
    );

    await expect(getSupabaseUser(accessToken)).resolves.toEqual({
      id: "supabase-user-1",
      email: "employee@example.com",
    });
  });

  it("rejects an expired or invalid access token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ message: "invalid JWT" }, { status: 401 }),
    );

    await expect(getSupabaseUser("expired-access-token-value")).rejects.toBeInstanceOf(
      SupabaseAuthError,
    );
  });

  it("rejects a valid Supabase session created by another authentication method", async () => {
    const accessToken = [
      "header",
      Buffer.from(JSON.stringify({
        sub: "supabase-user-1",
        amr: [{ method: "password" }],
      })).toString("base64url"),
      "signature",
    ].join(".");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        id: "supabase-user-1",
        email: "employee@example.com",
        email_confirmed_at: "2026-09-09T00:00:00Z",
      }),
    );

    await expect(getSupabaseUser(accessToken)).rejects.toThrow(
      "not created by an email magic link",
    );
  });
});
