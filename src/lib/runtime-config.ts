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

export function requireEmailAuthConfiguration() {
  if (
    !configured(process.env.SUPABASE_URL, ["PROJECT_REF", "replace-with"]) ||
    !configured(process.env.SUPABASE_ANON_KEY, ["replace-with", "PROJECT_REF"])
  ) {
    throw new ConfigurationError(
      "SUPABASE_EMAIL_AUTH_NOT_CONFIGURED",
      "Supabase email authentication is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
    );
  }

  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl) {
    throw new ConfigurationError(
      "APP_URL_NOT_CONFIGURED",
      "APP_URL is required for the Supabase email login redirect.",
    );
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(appUrl);
  } catch {
    throw new ConfigurationError("APP_URL_INVALID", "APP_URL must be an absolute URL.");
  }
  if (process.env.NODE_ENV === "production" && parsedUrl.protocol !== "https:") {
    throw new ConfigurationError("APP_URL_INSECURE", "APP_URL must use HTTPS in production.");
  }

  return {
    url: process.env.SUPABASE_URL!.replace(/\/+$/, ""),
    anonKey: process.env.SUPABASE_ANON_KEY!,
    redirectUrl: new URL("/employee", parsedUrl).toString(),
  };
}

export function publicConfigurationMessage(error: ConfigurationError) {
  return process.env.NODE_ENV === "production" ? error.productionMessage : error.message;
}
