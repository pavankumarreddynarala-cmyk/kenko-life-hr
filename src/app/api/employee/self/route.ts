import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession, getVerifiedEmail, setSessionCookie } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { allocateEmployeeCode, assertEmployeeUnique, employeeInclude } from "@/lib/employees";
import { onboardingSchema } from "@/lib/validators";
import { apiError, validationError } from "@/lib/api-error";
import { AppError, forbidden } from "@/lib/app-error";

// Everything about the signed-in employee in one payload for the Employee Portal profile:
// what they entered at onboarding, what HR/Admin added or changed since (the full Employee
// Master record with its organisation data), their assets and their transfer requests.
const selfInclude = {
  ...employeeInclude,
  assignments: {
    where: { returnedAt: null },
    include: { asset: { include: { qr: true } } },
    orderBy: { assignedAt: "desc" },
  },
  sentTransfers: {
    include: {
      asset: true,
      sender: { select: { permanentId: true, name: true } },
      receiver: { select: { permanentId: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  },
  receivedTransfers: {
    include: {
      asset: true,
      sender: { select: { permanentId: true, name: true } },
      receiver: { select: { permanentId: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  },
} satisfies Prisma.EmployeeInclude;

export async function GET(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session?.employeeId) {
      throw new AppError("Sign in to the Employee Portal to see your profile.", { status: 401, code: "UNAUTHENTICATED" });
    }
    const employee = await db.employee.findUnique({ where: { id: session.employeeId }, include: selfInclude });
    if (!employee || employee.deletedAt) {
      throw new AppError(
        "Your employee record could not be found. Contact HR so they can check that your record is active.",
        { status: 404, code: "NOT_FOUND" },
      );
    }
    return NextResponse.json({ employee });
  } catch (error) {
    return apiError(error, "Loading your profile");
  }
}

export async function POST(req: NextRequest) {
  try {
    const verifiedEmail = getVerifiedEmail(req);
    const session = getSession(req);
    if (!verifiedEmail && !session?.employeeId) {
      throw new AppError(
        "Your email has not been verified, or the verification expired. Go back, request a new OTP and verify your email first.",
        { status: 401, code: "EMAIL_NOT_VERIFIED" },
      );
    }
    const parsed = onboardingSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    if (verifiedEmail && parsed.data.email !== verifiedEmail) {
      throw forbidden(`The email must match the address you verified (${verifiedEmail}). Use that address, or start again to verify a different one.`);
    }

    const result = await db.$transaction(
      async (tx) => {
        const existing = session?.employeeId
          ? await tx.employee.findUnique({ where: { id: session.employeeId } })
          : await tx.employee.findUnique({ where: { email: parsed.data.email } });
        if (existing?.deletedAt) {
          throw forbidden("This employee record has been removed. Contact an administrator or HR to have it restored.");
        }
        if (existing) {
          if (!verifiedEmail && parsed.data.email !== existing.email) {
            throw forbidden("Verify the new email address with an OTP before changing it.");
          }
          await assertEmployeeUnique(
            tx,
            { phone: parsed.data.phone !== existing.phone ? parsed.data.phone : undefined, pan: parsed.data.pan, aadhaar: parsed.data.aadhaar },
            existing.id,
          );
          const employee = await tx.employee.update({ where: { id: existing.id }, data: parsed.data });
          await tx.employeeHistory.create({
            data: { employeeId: existing.id, snapshot: existing as never, reason: "Employee self-service update" },
          });
          await audit(
            {
              actorId: session?.userId ?? existing.id,
              email: employee.email ?? undefined,
              role: "EMPLOYEE",
              module: "EMPLOYEE",
              recordType: "Employee",
              recordId: employee.id,
              action: "SELF_UPDATED",
              previousValue: existing,
              newValue: employee,
            },
            tx,
          );
          return employee;
        }
        await assertEmployeeUnique(tx, { phone: parsed.data.phone, pan: parsed.data.pan, aadhaar: parsed.data.aadhaar });
        const permanentId = await allocateEmployeeCode(tx);
        const employee = await tx.employee.create({ data: { ...parsed.data, permanentId } });
        await audit(
          {
            actorId: employee.id,
            email: employee.email ?? undefined,
            role: "EMPLOYEE",
            module: "EMPLOYEE",
            recordType: "Employee",
            recordId: employee.id,
            action: "ONBOARDED",
            newValue: employee,
          },
          tx,
        );
        return employee;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    const response = NextResponse.json({ employee: result });
    setSessionCookie(response, {
      userId: session?.userId ?? result.id,
      email: result.email ?? result.phone,
      role: "EMPLOYEE",
      employeeId: result.id,
    });
    response.cookies.delete("kenko_email_verified");
    return response;
  } catch (error) {
    return apiError(error, "Saving your details");
  }
}
