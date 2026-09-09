import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { masterDefinitions } from "@/lib/masters";
import { apiError } from "@/lib/api-error";

type Delegate = { findMany: (args: { orderBy: { name: "asc" } }) => Promise<unknown[]> };

export async function GET(req: NextRequest) {
  try {
    requireRole(req, ["ADMIN", "HR", "CFO"]);
    const entries = await Promise.all(
      Object.entries(masterDefinitions).map(async ([key, definition]) => [
        key,
        await (definition.delegate as unknown as Delegate).findMany({ orderBy: { name: "asc" } }),
      ]),
    );
    return NextResponse.json({ data: Object.fromEntries(entries) });
  } catch (error) {
    return apiError(error, "Unable to load master data");
  }
}
