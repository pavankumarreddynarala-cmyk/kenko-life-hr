import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, requestJson } from "./client-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestJson", () => {
  it("surfaces structured API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "Employee portal database is not configured.",
            code: "DATABASE_NOT_CONFIGURED",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(requestJson("/api/otp")).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 503,
      code: "DATABASE_NOT_CONFIGURED",
      message: "Employee portal database is not configured.",
    } satisfies Partial<ApiRequestError>);
  });

  it("turns a Next HTML error response into a useful message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<!doctype html><title>Internal Server Error</title>", {
          status: 500,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );

    await expect(requestJson("/api/otp")).rejects.toThrow(
      "The server could not complete this request",
    );
  });
});
