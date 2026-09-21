import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { assertEmployeeUnique, employeeInclude, refreshDynamicEmployeeCode } from "@/lib/employees";
import { deleteRecordSchema, employeeAdminSchema, employeeCodeSchema } from "@/lib/validators";
import { apiError, validationError } from "@/lib/api-error";
import { AppError, forbidden, notFound } from "@/lib/app-error";
import { permissionsFor } from "@/lib/permissions";

const patchSchema = employeeAdminSchema.partial().extend({ permanentId: employeeCodeSchema.optional() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);

    const employee = await db.$transaction(async (tx) => {
      const before = await tx.employee.findUnique({ where: { id }, include: employeeInclude });
      if (!before) throw notFound("This employee");
      if (before.deletedAt) {
        throw new AppError(
          `${before.permanentId} (${before.name}) is deleted, so it cannot be edited. Restore the employee from the deleted list first.`,
          { status: 409, code: "RECORD_DELETED" },
        );
      }

      // Employee Code is auto-generated on create. Only privileged roles may overwrite it,
      // and the new value must not already belong to anyone (deleted employees included).
      const codeChanged = parsed.data.permanentId !== undefined && parsed.data.permanentId !== before.permanentId;
      if (codeChanged && !permissionsFor(session.role).editEmployeeCode) {
        throw forbidden("Only an Admin, CEO or COO can change an Employee Code. Ask one of them to make this change.");
      }
      await assertEmployeeUnique(
        tx,
        {
          permanentId: codeChanged ? parsed.data.permanentId : undefined,
          phone: parsed.data.phone !== before.phone ? parsed.data.phone : undefined,
          email: parsed.data.email,
          personalEmail: parsed.data.personalEmail,
          pan: parsed.data.pan,
          aadhaar: parsed.data.aadhaar,
        },
        id,
      );

      await tx.employee.update({ where: { id }, data: parsed.data });
      await refreshDynamicEmployeeCode(tx, id);
      const after = await tx.employee.findUniqueOrThrow({ where: { id }, include: employeeInclude });
      await tx.employeeHistory.create({
        data: {
          employeeId: id,
          snapshot: before as never,
          reason: codeChanged ? `Employee Code changed from ${before.permanentId} to ${after.permanentId}` : "Employee master update",
        },
      });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "EMPLOYEE",
          recordType: "Employee",
          recordId: id,
          action: "UPDATED",
          previousValue: before,
          newValue: after,
        },
        tx,
      );
      if (codeChanged) {
        await audit(
          {
            actorId: session.userId,
            email: session.email,
            role: session.role,
            module: "EMPLOYEE",
            recordType: "Employee",
            recordId: id,
            action: "EMPLOYEE_CODE_CHANGED",
            field: "permanentId",
            previousValue: { permanentId: before.permanentId, name: before.name },
            newValue: { permanentId: after.permanentId, name: after.name },
          },
          tx,
        );
      }
      return after;
    });
    return NextResponse.json({ data: employee });
  } catch (error) {
    return apiError(error, "Updating the employee");
  }
}

// Soft delete only — the record is never removed from the database. It is excluded from
// the default Employee Master listing, kept in the deletion history with who deleted it,
// when and why, and can be brought back with the restore endpoint.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = requireRole(req, MANAGEMENT_ROLES);
    const { id } = await params;
    const parsed = deleteRecordSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);

    const employee = await db.$transaction(async (tx) => {
      const before = await tx.employee.findUnique({ where: { id }, include: employeeInclude });
      if (!before) throw notFound("This employee");
      if (before.deletedAt) {
        throw new AppError(`${before.permanentId} (${before.name}) is already deleted.`, { status: 409, code: "RECORD_DELETED" });
      }
      const after = await tx.employee.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedById: session.userId,
          deletedByEmail: session.email,
          deleteReason: parsed.data.reason,
        },
      });
      await tx.employeeHistory.create({
        data: { employeeId: id, snapshot: before as never, reason: `Employee deleted (soft delete): ${parsed.data.reason}` },
      });
      await audit(
        {
          actorId: session.userId,
          email: session.email,
          role: session.role,
          module: "EMPLOYEE",
          recordType: "Employee",
          recordId: id,
          action: "DELETED",
          previousValue: before,
          newValue: after,
          reason: parsed.data.reason,
        },
        tx,
      );
      return after;
    });
    return NextResponse.json({ data: employee });
  } catch (error) {
    return apiError(error, "Deleting the employee");
  }
}
