import { Prisma, PrismaClient } from "@prisma/client";

type EmployeeClient = PrismaClient | Prisma.TransactionClient;

export class AmbiguousEmployeeEmailError extends Error {
  constructor() {
    super("More than one employee record uses this email address. Contact HR to correct the records.");
    this.name = "AmbiguousEmployeeEmailError";
  }
}

export async function findEmployeeIdByEmail(client: EmployeeClient, email: string) {
  const matches = await client.employee.findMany({
    where: {
      OR: [
        { email: { equals: email, mode: "insensitive" } },
        { personalEmail: { equals: email, mode: "insensitive" } },
        { user: { is: { email: { equals: email, mode: "insensitive" } } } },
      ],
    },
    select: { id: true },
    take: 2,
  });
  if (matches.length > 1) throw new AmbiguousEmployeeEmailError();
  return matches[0]?.id ?? null;
}
