export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

type ErrorBody = { error?: unknown; code?: unknown };

export async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new ApiRequestError("Unable to reach the server. Check your connection and try again.", 0, "NETWORK_ERROR");
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
          : `Request failed (${response.status}).`;
    throw new ApiRequestError(
      message,
      response.status,
      typeof errorBody.code === "string" ? errorBody.code : undefined,
    );
  }

  if (!body || typeof body !== "object") {
    throw new ApiRequestError("The server returned an invalid response.", response.status, "INVALID_RESPONSE");
  }
  return body as T;
}
