import { requireEmailAuthConfiguration } from "@/lib/runtime-config";

type SupabaseUser = {
  id?: string;
  email?: string;
  email_confirmed_at?: string;
};

type SupabaseAccessToken = {
  sub?: string;
  amr?: Array<{ method?: string }>;
};

export class SupabaseAuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SupabaseAuthError";
  }
}

async function readError(response: Response) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { error_description?: string; msg?: string; message?: string };
    return parsed.error_description || parsed.msg || parsed.message || body;
  } catch {
    return body;
  }
}

export async function sendEmailMagicLink(email: string) {
  const { url, anonKey, redirectUrl } = requireEmailAuthConfiguration();
  const response = await fetch(
    `${url}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectUrl)}`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, create_user: true }),
    },
  );
  if (!response.ok) {
    throw new SupabaseAuthError(response.status, await readError(response));
  }
}

export async function getSupabaseUser(accessToken: string) {
  const { url, anonKey } = requireEmailAuthConfiguration();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new SupabaseAuthError(response.status, await readError(response));
  }

  const user = (await response.json()) as SupabaseUser;
  if (!user.id || !user.email || !user.email_confirmed_at) {
    throw new SupabaseAuthError(401, "Supabase did not return a confirmed email identity.");
  }
  let claims: SupabaseAccessToken;
  try {
    claims = JSON.parse(
      Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as SupabaseAccessToken;
  } catch {
    throw new SupabaseAuthError(401, "Supabase returned an invalid access token.");
  }
  if (
    claims.sub !== user.id ||
    !claims.amr?.some(({ method }) => method === "otp" || method === "magiclink")
  ) {
    throw new SupabaseAuthError(401, "The Supabase session was not created by an email magic link.");
  }
  return {
    id: user.id,
    email: user.email.trim().toLowerCase(),
  };
}
