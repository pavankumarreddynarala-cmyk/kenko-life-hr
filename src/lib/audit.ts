import { Prisma, PrismaClient, Role } from "@prisma/client";
import { db } from "@/lib/db";

type AuditClient = PrismaClient | Prisma.TransactionClient;

export type AuditInput = {
  actorId?: string;
  email?: string;
  role?: Role;
  module: string;
  recordType: string;
  recordId: string;
  action: string;
  field?: string;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: unknown;
  reason?: string;
};

export async function audit(input: AuditInput, client: AuditClient = db) {
  return client.auditLog.create({
    data: {
      ...input,
      previousValue: input.previousValue as Prisma.InputJsonValue | undefined,
      newValue: input.newValue as Prisma.InputJsonValue | undefined,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
