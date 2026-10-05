import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError, validationError } from "@/lib/api-error";
import { unauthenticated } from "@/lib/app-error";
import { emailSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

// Management roles only. Employees sign in with an email OTP, not a password.
const LOGIN_PASSWORD_MESSAGE = "Use at least 10 characters.";
const createSchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: emailSchema,
  password: z.string({ required_error: "Enter a password." }).min(10, LOGIN_PASSWORD_MESSAGE).max(72, "Use 72 characters or fewer."),
  role: z.enum(["ADMIN", "CEO", "COO", "HR", "CFO"], { errorMap: () => ({ message: "Choose Admin, CEO, COO, HR or CFO." }) }),
});

// The session token outlives a purge or a deleted account, so confirm the account is real.
async function assertAccountStillExists(userId: string) {
  if (!(await db.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw unauthenticated();
}

export async function GET(req: NextRequest) {
  try {
    const session = requireSuperAdmin(req);
    await assertAccountStillExists(session.userId);
    const data = await db.user.findMany({
      where: { role: { not: "EMPLOYEE" } },
      select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error, "Loading logins");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireSuperAdmin(req);
    await assertAccountStillExists(session.userId);
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: parsed.data.email, name: parsed.data.name || null, role: parsed.data.role, passwordHash },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
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
    return apiError(error, "Creating the login");
  }
}
