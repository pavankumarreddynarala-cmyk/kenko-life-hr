import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ConfigurationError,
  requireDatabaseConfiguration,
  requireOtpProviderConfiguration,
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

  it("defaults to development OTP outside production", () => {
    vi.stubEnv("OTP_PROVIDER", "");
    vi.stubEnv("NODE_ENV", "test");
    expect(requireOtpProviderConfiguration()).toBe("development");
  });

  it("rejects development OTP in production", () => {
    vi.stubEnv("OTP_PROVIDER", "development");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => requireOtpProviderConfiguration()).toThrowError(
      "Development OTP is disabled in production",
    );
  });

  it("rejects placeholder Supabase settings", () => {
    vi.stubEnv("OTP_PROVIDER", "supabase");
    vi.stubEnv("SUPABASE_URL", "https://PROJECT_REF.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "replace-with-supabase-anon-key");
    expect(() => requireOtpProviderConfiguration()).toThrowError(
      "Supabase email OTP is selected",
    );
  });
});
