import { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { AmbiguousEmployeeEmailError, findEmployeeIdByEmail } from "./employee-auth";

describe("employee email matching", () => {
  it("matches either the work or personal email without case sensitivity", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "employee-1" }]);
    const client = { employee: { findMany } } as unknown as PrismaClient;

    await expect(findEmployeeIdByEmail(client, "employee@example.com")).resolves.toBe(
      "employee-1",
    );
    expect(findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { email: { equals: "employee@example.com", mode: "insensitive" } },
          { personalEmail: { equals: "employee@example.com", mode: "insensitive" } },
          {
            user: {
              is: { email: { equals: "employee@example.com", mode: "insensitive" } },
            },
          },
        ],
      },
      select: { id: true },
      take: 2,
    });
  });

  it("rejects ambiguous employee records", async () => {
    const client = {
      employee: {
        findMany: vi.fn().mockResolvedValue([{ id: "employee-1" }, { id: "employee-2" }]),
      },
    } as unknown as PrismaClient;

    await expect(findEmployeeIdByEmail(client, "shared@example.com")).rejects.toBeInstanceOf(
      AmbiguousEmployeeEmailError,
    );
  });
});
