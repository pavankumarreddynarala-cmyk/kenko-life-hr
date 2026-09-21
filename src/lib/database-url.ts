/**
 * Cleans up a DATABASE_URL the way people commonly paste it into a hosting dashboard:
 * with surrounding quotes (copied from `.env.example`), stray whitespace/newlines, or the
 * variable name itself ("DATABASE_URL=postgresql://…"). Hosting dashboards store the value
 * literally, so a leading quote makes Prisma reject it before it ever tries to connect.
 */
export function normalizeDatabaseUrl(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  let value = raw.trim();
  value = value.replace(/^(?:export\s+)?DATABASE_URL\s*=\s*/i, "");
  const quoted = value.match(/^(['"`])([\s\S]*)\1$/);
  if (quoted) value = quoted[2];
  return value.trim();
}

export function hasPostgresProtocol(value: string | undefined): boolean {
  return /^postgres(?:ql)?:\/\//.test(value ?? "");
}
