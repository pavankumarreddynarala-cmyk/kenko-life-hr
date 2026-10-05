import { NextRequest, NextResponse } from "next/server";
import { requireRole, MANAGEMENT_ROLES } from "@/lib/auth";
import { masterDefinitions, masterOrderBy, type MasterType } from "@/lib/masters";
import { apiError } from "@/lib/api-error";

type Delegate = { findMany: (args: { orderBy: Record<string, "asc"> }) => Promise<unknown[]> };

export async function GET(req: NextRequest) {
  try {
    requireRole(req, MANAGEMENT_ROLES);
    const entries = await Promise.all(
      Object.entries(masterDefinitions).map(async ([key, definition]) => [
        key,
        await (definition.delegate as unknown as Delegate).findMany({ orderBy: masterOrderBy(key as MasterType) }),
      ]),
    );
    return NextResponse.json({ data: Object.fromEntries(entries) });
  } catch (error) {
    return apiError(error, "Unable to load master data");
  }
}
