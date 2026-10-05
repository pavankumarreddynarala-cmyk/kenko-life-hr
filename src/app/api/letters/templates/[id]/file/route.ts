import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DOCUMENT_ROLES, requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { notFound } from "@/lib/app-error";
import { DOCX_MIME } from "@/lib/letters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireRole(req, DOCUMENT_ROLES);
    const template = await db.letterTemplate.findUnique({ where: { id: (await params).id } });
    if (!template) throw notFound("The template");
    return new NextResponse(new Uint8Array(template.content), {
      headers: { "Content-Type": DOCX_MIME, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(template.fileName)}`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error, "Downloading the template");
  }
}
