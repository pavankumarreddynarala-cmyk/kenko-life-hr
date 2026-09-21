import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { apiError, validationError } from "@/lib/api-error";
import { AppError } from "@/lib/app-error";
import { changePasswordSchema, PASSWORD_RULES } from "@/lib/validators";

function invalid(field: string, label: string, message: string, status = 400) {
  return new AppError(`${label}: ${message}`, { status, code: "VALIDATION_ERROR", fields: [{ field, label, message }] });
}

export async function POST(req: NextRequest) {
  try {
    const session = requireRole(
      req,
      MANAGEMENT_ROLES,
      "Only management accounts have a password. Employees sign in with an email OTP and have nothing to change here.",
    );
    const parsed = changePasswordSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const { currentPassword, newPassword, confirmPassword } = parsed.data;

    if (newPassword !== confirmPassword) {
      throw invalid("confirmPassword", "Confirm new password", "The two new passwords do not match. Type the same password in both boxes.");
    }
    if (newPassword === currentPassword) {
      throw invalid("newPassword", "New password", `The new password is the same as the current one. Choose a different password. ${PASSWORD_RULES}`);
    }

    const user = await db.user.findUnique({ where: { id: session.userId } });
    if (!user?.passwordHash) {
      throw new AppError("Your account could not be found. Sign in again and retry.", { status: 401, code: "UNAUTHENTICATED" });
    }
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      await audit({
        actorId: user.id,
        email: user.email,
        role: user.role,
        module: "AUTH",
        recordType: "User",
        recordId: user.id,
        action: "PASSWORD_CHANGE_FAILED",
      });
      throw invalid("currentPassword", "Current password", "The current password is incorrect. Re-enter it exactly as you use it to sign in.");
    }

    await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
    await audit({
      actorId: user.id,
      email: user.email,
      role: user.role,
      module: "AUTH",
      recordType: "User",
      recordId: user.id,
      action: "PASSWORD_CHANGED",
    });
    return NextResponse.json({ ok: true, message: "Your password was changed. Use the new password the next time you sign in." });
  } catch (error) {
    return apiError(error, "Changing your password");
  }
}
