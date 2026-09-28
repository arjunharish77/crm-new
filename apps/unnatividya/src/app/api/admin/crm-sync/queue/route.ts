import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-auth";
import { queueManualCrmPush } from "@/lib/crm-sync";

const schema = z.object({ leadId: z.string().uuid() });

export async function POST(request: Request) {
  // F26 fix (WP16): DB-backed session check -- see getAdminSession in src/lib/admin-auth.ts for
  // why proxy.ts's cookie-only check on /api/admin/* isn't sufficient by itself.
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "CMS admin login required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  try {
    return NextResponse.json(await queueManualCrmPush(parsed.data.leadId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not queue CRM push" }, { status: 400 });
  }
}
