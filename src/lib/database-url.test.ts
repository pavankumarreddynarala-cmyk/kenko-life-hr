import { describe, expect, it } from "vitest";
import { hasPostgresProtocol, normalizeDatabaseUrl } from "./database-url";

const url = "postgresql://postgres.abc:pw@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1";

describe("normalizeDatabaseUrl", () => {
  it("leaves a correct URL untouched", () => {
    expect(normalizeDatabaseUrl(url)).toBe(url);
  });

  it("strips the quotes copied from .env.example", () => {
    expect(normalizeDatabaseUrl(`"${url}"`)).toBe(url);
    expect(normalizeDatabaseUrl(`'${url}'`)).toBe(url);
  });

  it("strips whitespace, newlines and a pasted variable name", () => {
    expect(normalizeDatabaseUrl(`  ${url}\n`)).toBe(url);
    expect(normalizeDatabaseUrl(`DATABASE_URL=${url}`)).toBe(url);
    expect(normalizeDatabaseUrl(`DATABASE_URL="${url}"`)).toBe(url);
  });

  it("passes through undefined and still fails a value that is not a database URL", () => {
    expect(normalizeDatabaseUrl(undefined)).toBeUndefined();
    expect(hasPostgresProtocol(normalizeDatabaseUrl("PROJECT_REF"))).toBe(false);
    expect(hasPostgresProtocol(normalizeDatabaseUrl(`"${url}"`))).toBe(true);
    expect(hasPostgresProtocol("postgres://u:p@h/db")).toBe(true);
  });
});
