import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ConfigurationError,
  requireDatabaseConfiguration,
  requireEmailAuthConfiguration,
} from "./runtime-config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runtime configuration", () => {
  it("reports a missing database before Prisma throws", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(() => requireDatabaseConfiguration()).toThrowError(ConfigurationError);
    try {
      requireDatabaseConfiguration();
    } catch (error) {
      expect((error as ConfigurationError).code).toBe("DATABASE_NOT_CONFIGURED");
    }
  });

  it("rejects placeholder Supabase email settings", () => {
    vi.stubEnv("SUPABASE_URL", "https://PROJECT_REF.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "replace-with-supabase-anon-key");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(() => requireEmailAuthConfiguration()).toThrowError(
      "Supabase email authentication is not configured",
    );
  });

  it("builds the employee callback from APP_URL", () => {
    vi.stubEnv("SUPABASE_URL", "https://kenko.supabase.co/");
    vi.stubEnv("SUPABASE_ANON_KEY", "valid-anon-key");
    vi.stubEnv("APP_URL", "http://localhost:3000/base");
    vi.stubEnv("NODE_ENV", "test");
    expect(requireEmailAuthConfiguration()).toEqual({
      url: "https://kenko.supabase.co",
      anonKey: "valid-anon-key",
      redirectUrl: "http://localhost:3000/employee",
    });
  });

  it("requires HTTPS redirects in production", () => {
    vi.stubEnv("SUPABASE_URL", "https://kenko.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "valid-anon-key");
    vi.stubEnv("APP_URL", "http://example.com");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => requireEmailAuthConfiguration()).toThrowError("APP_URL must use HTTPS");
  });
});
