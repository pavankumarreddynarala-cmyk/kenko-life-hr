import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError } from "@/lib/api-error";

// Management roles only. Employees sign in with their email link, not a password.
const createSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10, "Password must be at least 10 characters").max(128),
  role: z.enum(["ADMIN", "HR", "CFO"]),
});

async function assertAccountStillExists(userId: string) {
  // The session token outlives a purge or deletion, so confirm the account is real.
  if (!(await db.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw new Error("UNAUTHENTICATED");
}

export async function GET(req: NextRequest) {
  try {
    const session = requireSuperAdmin(req);
    await assertAccountStillExists(session.userId);
    const data = await db.user.findMany({
      where: { role: { not: "EMPLOYEE" } },
      select: { id: true, email: true, role: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error, "Unable to load logins");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireSuperAdmin(req);
    await assertAccountStillExists(session.userId);
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: parsed.data.email, role: parsed.data.role, passwordHash },
        select: { id: true, email: true, role: true, createdAt: true },
      });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "AUTH",
          recordType: "User",
          recordId: created.id,
          action: "LOGIN_CREATED",
          newValue: { email: created.email, role: created.role },
        },
        tx,
      );
      return created;
    });
    return NextResponse.json({ data: user }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A login with this email already exists" }, { status: 409 });
    }
    return apiError(error, "Unable to create login");
  }
}
