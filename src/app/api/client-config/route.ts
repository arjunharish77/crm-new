import { NextResponse } from "next/server";

// Round-2 plan O5: what the browser needs at run time without baking it into the image. Public
// on purpose: a Sentry DSN only allows sending events, and is visible in any page that uses it.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      sentryDsn: process.env.SENTRY_DSN_WEB || null,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "production",
      release: process.env.CRM_VERSION || null,
    },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
