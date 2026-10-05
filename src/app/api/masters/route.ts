import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { masterDefinitions, masterOrderBy, MasterType } from "@/lib/masters";
import { apiError } from "@/lib/api-error";

type Delegate = { findMany: (args: { orderBy: Record<string, "asc"> }) => Promise<unknown[]> };

export async function GET(req: NextRequest) {
  try {
    requireRole(req, ["ADMIN", "HR", "CFO"]);
    const entries = await Promise.all(
      Object.entries(masterDefinitions).map(async ([key, definition]) => [
        key,
        await (definition.delegate as unknown as Delegate).findMany({ orderBy: masterOrderBy(key as MasterType) }),
      ]),
    );
    return NextResponse.json({ data: Object.fromEntries(entries) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Unable to load master data");
  }
}
