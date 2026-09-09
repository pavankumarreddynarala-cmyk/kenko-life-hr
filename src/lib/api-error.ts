import { NextResponse } from "next/server";

export function apiError(error: unknown, fallback: string, status = 500) {
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (error instanceof Error && error.message === "FORBIDDEN") {
    return NextResponse.json({ error: "You do not have access to this action" }, { status: 403 });
  }
  console.error(error);
  return NextResponse.json({ error: fallback }, { status });
}
