export class ConfigurationError extends Error {
  constructor(
    public readonly code: string,
    developmentMessage: string,
    public readonly productionMessage = "Employee sign-in is temporarily unavailable. Contact an administrator.",
  ) {
    super(developmentMessage);
    this.name = "ConfigurationError";
  }
}

function configured(value: string | undefined, placeholders: string[]) {
  if (!value?.trim()) return false;
  return !placeholders.some((placeholder) => value.includes(placeholder));
}

export function requireDatabaseConfiguration() {
  if (
    !configured(process.env.DATABASE_URL, [
      "PROJECT_REF",
      "PASSWORD",
      "REGION",
      "replace-with",
    ])
  ) {
    throw new ConfigurationError(
      "DATABASE_NOT_CONFIGURED",
      "Employee portal database is not configured. Copy .env.example to .env.local, set DATABASE_URL and DIRECT_URL, then run npx prisma migrate deploy.",
    );
  }
}

export type OtpProvider = "development" | "supabase" | "twilio";

export function requireOtpProviderConfiguration(): OtpProvider {
  const value = process.env.OTP_PROVIDER?.trim().toLowerCase();
  if (!value) {
    if (process.env.NODE_ENV !== "production") return "development";
    throw new ConfigurationError("OTP_PROVIDER_NOT_CONFIGURED", "OTP_PROVIDER is required in production.");
  }
  if (value !== "development" && value !== "supabase" && value !== "twilio") {
    throw new ConfigurationError(
      "OTP_PROVIDER_INVALID",
      "OTP_PROVIDER must be development, supabase, or twilio.",
    );
  }
  if (value === "development") {
    if (process.env.NODE_ENV === "production") {
      throw new ConfigurationError(
        "DEVELOPMENT_OTP_DISABLED",
        "Development OTP is disabled in production. Configure Supabase Phone Auth or Twilio Verify.",
      );
    }
    return value;
  }
  if (
    value === "supabase" &&
    (!configured(process.env.SUPABASE_URL, ["PROJECT_REF", "replace-with"]) ||
      !configured(process.env.SUPABASE_ANON_KEY, ["replace-with", "PROJECT_REF"]))
  ) {
    throw new ConfigurationError(
      "SUPABASE_OTP_NOT_CONFIGURED",
      "Supabase email OTP is selected but SUPABASE_URL or SUPABASE_ANON_KEY is missing.",
    );
  }
  if (
    value === "twilio" &&
    (!configured(process.env.TWILIO_ACCOUNT_SID, ["xxxxxxxx", "replace-with"]) ||
      !configured(process.env.TWILIO_AUTH_TOKEN, ["replace-with"]) ||
      !configured(process.env.TWILIO_VERIFY_SERVICE_SID, ["xxxxxxxx", "replace-with"]))
  ) {
    throw new ConfigurationError(
      "TWILIO_OTP_NOT_CONFIGURED",
      "Twilio email OTP is selected but TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_VERIFY_SERVICE_SID is missing (the Twilio Verify service must have an email channel configured).",
    );
  }
  return value;
}

export function publicConfigurationMessage(error: ConfigurationError) {
  return process.env.NODE_ENV === "production" ? error.productionMessage : error.message;
}
