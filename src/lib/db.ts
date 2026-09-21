import { PrismaClient } from "@prisma/client";
import { normalizeDatabaseUrl } from "@/lib/database-url";

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

function createClient() {
  // Tolerate a DATABASE_URL pasted with quotes/whitespace (see database-url.ts).
  const url = normalizeDatabaseUrl(process.env.DATABASE_URL);
  return url ? new PrismaClient({ datasourceUrl: url }) : new PrismaClient();
}

export const db = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
