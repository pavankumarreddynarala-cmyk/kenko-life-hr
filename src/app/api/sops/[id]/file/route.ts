import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { forbidden, notFound, unauthenticated } from "@/lib/app-error";
import { isManagementRole } from "@/lib/permissions";
import { sopVisibleTo } from "@/lib/sops";

export const dynamic = "force-dynamic";

// Management can download everything; an employee can download only what is tagged to them.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(req);
    if (!session) throw unauthenticated();
    const sop = await db.sopDocument.findUnique({ where: { id: (await params).id } });
    if (!sop) throw notFound("The SOP");
    if (!isManagementRole(session.role)) {
      const employee = session.employeeId
        ? await db.employee.findUnique({ where: { id: session.employeeId }, select: { departmentId: true, employeeRoleId: true, deletedAt: true } })
        : null;
      if (!employee || employee.deletedAt || !sopVisibleTo(sop, employee)) throw forbidden("This document is not shared with you.");
    }
    return new NextResponse(new Uint8Array(sop.content), {
      headers: {
        "Content-Type": sop.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(sop.fileName)}"; filename*=UTF-8''${encodeURIComponent(sop.fileName)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error, "Downloading the SOP");
  }
}
