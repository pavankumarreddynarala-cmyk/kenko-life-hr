import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession, getVerifiedEmail, signSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { allocateEmployeeCode } from "@/lib/employees";
import { onboardingSchema } from "@/lib/validators";

const selfInclude = {
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
} as const;

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session?.employeeId) return NextResponse.json({ error: "Employee authentication required" }, { status: 401 });
  const employee = await db.employee.findUnique({ where: { id: session.employeeId }, include: selfInclude });
  if (!employee || employee.deletedAt) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  return NextResponse.json({ employee });
}

export async function POST(req: NextRequest) {
  const verifiedEmail = getVerifiedEmail(req);
  const session = getSession(req);
  if (!verifiedEmail && !session?.employeeId) {
    return NextResponse.json({ error: "Verify your email first" }, { status: 401 });
  }
  const parsed = onboardingSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  if (verifiedEmail && parsed.data.email !== verifiedEmail) {
    return NextResponse.json({ error: "Email must match the verified session" }, { status: 403 });
  }

  try {
    const result = await db.$transaction(
      async (tx) => {
        const existing = session?.employeeId
          ? await tx.employee.findUnique({ where: { id: session.employeeId } })
          : await tx.employee.findUnique({ where: { email: parsed.data.email } });
        if (existing?.deletedAt) throw new Error("This employee record has been removed. Contact an administrator.");
        if (existing) {
          if (!verifiedEmail && parsed.data.email !== existing.email) {
            throw new Error("Verify the new email before changing it");
          }
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
    response.cookies.set(
      "kenko_session",
      signSession({
        userId: session?.userId ?? result.id,
        email: result.email ?? result.phone,
        role: "EMPLOYEE",
        employeeId: result.id,
      }),
      {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        maxAge: 8 * 60 * 60,
        path: "/",
      },
    );
    response.cookies.delete("kenko_email_verified");
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save employee details";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
