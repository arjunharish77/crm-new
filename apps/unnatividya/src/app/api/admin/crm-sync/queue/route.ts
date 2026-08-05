import { NextResponse } from "next/server";
import { z } from "zod";
import { queueManualCrmPush } from "@/lib/crm-sync";

const schema = z.object({ leadId: z.string().uuid() });

export async function POST(request: Request) {
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
