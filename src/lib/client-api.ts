import type { FieldIssue } from "@/lib/app-error";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly fields: FieldIssue[] = [],
    public readonly reference?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

type ErrorBody = { error?: unknown; code?: unknown; fields?: unknown; reference?: unknown };

export const SESSION_EXPIRED_EVENT = "kenko:session-expired";

function readFields(value: unknown): FieldIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { field, label, message } = item as Record<string, unknown>;
    return typeof field === "string" && typeof message === "string"
      ? [{ field, label: typeof label === "string" ? label : undefined, message }]
      : [];
  });
}

export async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new ApiRequestError(
      "Unable to reach the server. Check your internet connection and try again.",
      0,
      "NETWORK_ERROR",
    );
  }

  const raw = await response.text();
  let body: unknown;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const errorBody = body && typeof body === "object" ? (body as ErrorBody) : {};
    const message =
      typeof errorBody.error === "string"
        ? errorBody.error
        : response.status >= 500
          ? "The server could not complete this request. Check the server configuration and try again."
          : `Request failed (${response.status}). Reload the page and try again.`;
    const code = typeof errorBody.code === "string" ? errorBody.code : undefined;
    // A signed-in page whose session lapsed (idle timeout, sign-out in another tab):
    // let the app shell explain it and send the user to the right sign-in page.
    if (response.status === 401 && code === "UNAUTHENTICATED" && typeof window !== "undefined") {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw new ApiRequestError(
      message,
      response.status,
      code,
      readFields(errorBody.fields),
      typeof errorBody.reference === "string" ? errorBody.reference : undefined,
    );
  }

  if (!body || typeof body !== "object") {
    throw new ApiRequestError("The server returned an invalid response.", response.status, "INVALID_RESPONSE");
  }
  return body as T;
}

export function jsonBody(method: "POST" | "PATCH" | "PUT" | "DELETE", data: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
}

/** field name -> message, for highlighting the inputs an API validation error refers to. */
export function fieldErrorMap(error: unknown): Record<string, string> {
  if (!(error instanceof ApiRequestError)) return {};
  return Object.fromEntries(error.fields.filter((issue) => issue.field).map((issue) => [issue.field, issue.message]));
}
