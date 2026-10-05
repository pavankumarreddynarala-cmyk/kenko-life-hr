// R2: one-time, IRREVERSIBLE purge of every row in the database.
//
//   1. Writes a complete backup to ./backups/ (JSON, one file) and shows you where it is.
//   2. Asks you to type the confirmation phrase.
//   3. Truncates every application table (permanent delete, nothing is marked "deleted").
//
// Usage:  npm run purge:all -- --confirm
// Afterwards run `npm run bootstrap:admin`, and rotate JWT_SECRET so old sessions stop working.
import { PrismaClient } from "@prisma/client";
import { chmodSync, mkdirSync, writeFileSync } from "fs";
import { createInterface } from "readline/promises";
import path from "path";

const db = new PrismaClient();
const PHRASE = "DELETE ALL DATA";
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function tables() {
  const rows = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%' ORDER BY tablename`;
  return rows.map((row) => row.tablename);
}

async function main() {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Refusing to run without --confirm. Usage: npm run purge:all -- --confirm");
  }
  const names = await tables();
  const counts: Record<string, number> = {};
  const backup: Record<string, unknown[]> = {};
  for (const name of names) {
    const rows = await db.$queryRawUnsafe<unknown[]>(`SELECT * FROM ${quote(name)}`);
    backup[name] = rows;
    counts[name] = rows.length;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.resolve(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `kenko-backup-${stamp}.json`);
  writeFileSync(file, JSON.stringify({ takenAt: new Date().toISOString(), counts, tables: backup }, (_, value) => (typeof value === "bigint" ? value.toString() : value), 2));
  try { chmodSync(file, 0o600); } catch { /* not supported on some Windows setups */ }

  console.log(`\nBackup written: ${file}`);
  console.log("It contains personal data and password hashes. Hand it over and store it securely; it is git-ignored.\n");
  console.table(counts);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Type "${PHRASE}" to permanently delete everything above: `);
  rl.close();
  if (answer.trim() !== PHRASE) {
    console.log("Confirmation did not match. Nothing was deleted.");
    return;
  }

  await db.$executeRawUnsafe(`TRUNCATE TABLE ${names.map(quote).join(", ")} RESTART IDENTITY CASCADE`);
  const left = await Promise.all(names.map(async (name) => (await db.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT COUNT(*) AS n FROM ${quote(name)}`))[0].n));
  console.log(`\nPurge complete. Rows remaining across ${names.length} tables: ${left.reduce((a, b) => a + Number(b), 0)}.`);
  console.log("Next: run `npm run bootstrap:admin`, then change JWT_SECRET so previously issued sessions are invalid.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
