import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError, validationError } from "@/lib/api-error";
import { notFound, unauthenticated } from "@/lib/app-error";

const resetSchema = z.object({
  password: z.string({ required_error: "Enter a new password." }).min(10, "Use at least 10 characters.").max(72, "Use 72 characters or fewer."),
});

// Reset a login's password. Only the main administrator can call this; everyone else gets 403.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = requireSuperAdmin(req);
    if (!(await db.user.findUnique({ where: { id: session.userId }, select: { id: true } }))) throw unauthenticated();
    const { id } = await params;
    const parsed = resetSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const target = await db.user.findUnique({ where: { id }, select: { id: true, email: true, role: true } });
    if (!target || target.role === "EMPLOYEE") throw notFound("This login");
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash } });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "AUTH",
          recordType: "User",
          recordId: id,
          action: "LOGIN_PASSWORD_RESET",
          metadata: { targetEmail: target.email },
        },
        tx,
      );
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "Resetting the password");
  }
}
