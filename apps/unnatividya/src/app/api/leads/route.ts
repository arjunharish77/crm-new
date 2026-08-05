import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";

const leadSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  phone: z.string().trim().regex(/^\d{10}$/),
  city: z.string().trim().optional().default(""),
  course: z.string().optional(),
  university: z.string().optional(),
  intent: z.string().optional(),
  interest: z.string().optional(),
  goal: z.string().optional(),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = leadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid lead details" }, { status: 400 });
  }

  const lead = parsed.data;
  const created = await query<{ id: string }>(
    `insert into lead_capture (
      name, email, phone, city, course_id, university_id, source_path, source_page_type,
      consent_accepted, crm_sync_status
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, true, 'DISABLED')
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
