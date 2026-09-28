import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { initialCrmSyncStatus } from "@/lib/crm-sync";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

const leadSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  phone: z.string().trim().regex(/^\+\d{6,15}$/),
  city: z.string().trim().optional().default(""),
  course: z.string().optional(),
  university: z.string().optional(),
  intent: z.string().optional(),
  interest: z.string().optional(),
  goal: z.string().optional(),
  // F27 fix (WP16): this used to be hardcoded `true` in the insert below regardless of what (if
  // anything) was submitted -- fabricating consent evidence for every lead, including ones
  // created by a direct API call that never showed anyone the consent copy. `z.literal(true)`
  // means the request must explicitly assert consent was given; anything else (missing, false,
  // a truthy-but-not-`true` value) fails validation below and no lead is created at all, rather
  // than silently inventing consent. See components/lead-form.tsx for the checkbox that is the
  // real, user-driven source of this value.
  consent: z.literal(true),
});

export async function POST(request: Request) {
  // F27 fix (WP16): 10 submissions per 10 minutes per IP -- generous for a real visitor filling
  // the wizard (including retries), tight enough to block scripted flooding of fake leads.
  const limit = checkRateLimit("lead-capture", clientIp(request), 10, 10 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const parsed = leadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid lead details" }, { status: 400 });
  }

  const lead = parsed.data;
  const crmSyncStatus = await initialCrmSyncStatus();
  const created = await query<{ id: string }>(
    `insert into lead_capture (
      name, email, phone, city, course_id, university_id, source_path, source_page_type,
      consent_accepted, crm_sync_status
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    returning id`,
    [
      lead.name,
      lead.email,
      lead.phone,
      lead.city || null,
      lead.course || null,
      lead.university || null,
      request.headers.get("referer") || null,
      lead.intent || "lead_form",
      lead.consent,
      crmSyncStatus,
    ],
  );

  const leadId = created.rows[0].id;
  await query(
    `insert into lead_event (lead_capture_id, event_type, metadata)
     values ($1, 'LEAD_CREATED', $2)`,
    [leadId, { intent: lead.intent || "lead_form", interest: lead.interest || null, goal: lead.goal || null }],
  );

  return NextResponse.json({ leadId });
}
