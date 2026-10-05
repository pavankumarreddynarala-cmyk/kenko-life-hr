import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession, getVerifiedEmail, signSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { allocateEmployeeCode } from "@/lib/employees";
import { findEmployeeIdByEmail } from "@/lib/employee-auth";
import { onboardingSchema } from "@/lib/validators";
import { safeAssetSelect } from "@/lib/transfers";

const selfInclude = {
  assignments: {
    where: { returnedAt: null },
    select: { id: true, assignedAt: true, custodianType: true, asset: { select: safeAssetSelect } },
    orderBy: { assignedAt: "desc" },
  },
  sentTransfers: {
    include: {
      asset: { select: safeAssetSelect },
      sender: { select: { permanentId: true, name: true } },
      receiver: { select: { permanentId: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  },
  receivedTransfers: {
    include: {
      asset: { select: safeAssetSelect },
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
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
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
  if (verifiedEmail && parsed.data.email !== verifiedEmail.email) {
    return NextResponse.json({ error: "Email must match the verified session" }, { status: 403 });
  }

  try {
    const result = await db.$transaction(
      async (tx) => {
        const matchedEmployeeId = verifiedEmail
          ? await findEmployeeIdByEmail(tx, verifiedEmail.email)
          : session?.employeeId ?? null;
        const existing = matchedEmployeeId
          ? await tx.employee.findUnique({ where: { id: matchedEmployeeId } })
          : null;
        if (existing) {
          const authenticatedEmails = [existing.email, existing.personalEmail]
            .filter((value): value is string => Boolean(value))
            .map((value) => value.toLowerCase());
          if (!verifiedEmail && !authenticatedEmails.includes(parsed.data.email)) {
            throw new Error("Verify the new email address before changing it");
          }
          const employee = await tx.employee.update({ where: { id: existing.id }, data: parsed.data });
          await tx.employeeHistory.create({
            data: { employeeId: existing.id, snapshot: existing as never, reason: "Employee self-service update" },
          });
          await audit(
            {
              actorId: verifiedEmail?.subject ?? session?.userId ?? existing.id,
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
        const conflictingIdentity = await tx.employee.findFirst({
          where: {
            OR: [
              { phone: parsed.data.phone },
              { pan: parsed.data.pan },
              { aadhaar: parsed.data.aadhaar },
            ],
          },
          select: { id: true },
        });
        if (conflictingIdentity) {
          throw new Error(
            "An employee record already uses this mobile, PAN, or Aadhaar. Contact HR to link your verified email.",
          );
        }
        const permanentId = await allocateEmployeeCode(tx);
        const employee = await tx.employee.create({ data: { ...parsed.data, permanentId } });
        await audit(
          {
            actorId: verifiedEmail?.subject ?? employee.id,
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
    );
    const response = NextResponse.json({ employee: result });
    response.cookies.set(
      "kenko_session",
      signSession({
        userId: verifiedEmail?.subject ?? session?.userId ?? result.id,
        email: result.email ?? verifiedEmail?.email ?? "",
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "These employee details are already registered. Contact HR to link your verified email." },
        { status: 409 },
      );
    }
    const message = error instanceof Error ? error.message : "Unable to save employee details";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
