import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db/query";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await queryOne<{ ok: number }>("select 1 as ok");
    return NextResponse.json({
      ok: result?.ok === 1,
      database: result?.ok === 1 ? "ok" : "unknown",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("HEALTHCHECK_FAILED", error);
    const message =
      process.env.NODE_ENV === "development" && error instanceof Error ? error.message : "Healthcheck failed";
    return NextResponse.json(
      {
        ok: false,
        database: "error",
        message,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
