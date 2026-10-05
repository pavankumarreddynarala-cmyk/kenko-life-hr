import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError } from "@/lib/api-error";

const resetSchema = z.object({ password: z.string().min(10, "Password must be at least 10 characters").max(128) });

// Reset a login's password. Only the super admin account can call this; others get 403.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = requireSuperAdmin(req);
    if (!(await db.user.findUnique({ where: { id: session.userId }, select: { id: true } }))) throw new Error("UNAUTHENTICATED");
    const { id } = await params;
    const parsed = resetSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const target = await db.user.findUnique({ where: { id }, select: { id: true, email: true, role: true } });
    if (!target || target.role === "EMPLOYEE") return NextResponse.json({ error: "Login not found" }, { status: 404 });
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
    return apiError(error, "Unable to reset password");
  }
}
