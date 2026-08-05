import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    await query("select 1");
    return NextResponse.json({
      ok: true,
      service: "unnatividya-web",
      database: "ok",
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        service: "unnatividya-web",
        database: "error",
        message: error instanceof Error ? error.message : "Unknown database error",
        checkedAt: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
