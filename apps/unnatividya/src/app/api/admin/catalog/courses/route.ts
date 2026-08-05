import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";

const courseSchema = z.object({
  id: z.string().trim().min(2).regex(/^[a-z0-9-]+$/),
  slug: z.string().trim().min(2).regex(/^[a-z0-9-]+$/),
  universityId: z.string().trim().min(1),
  name: z.string().trim().min(2),
  shortName: z.string().trim().min(1),
  level: z.enum(["UG", "PG"]),
  programType: z.string().trim().min(1).default("DEGREE"),
  ugcApproved: z.boolean(),
  stream: z.string().trim().min(2),
  feeInr: z.number().int().positive().nullable(),
  duration: z.string().trim().optional().default(""),
  status: z.enum(["DRAFT", "NEEDS_REVIEW", "PUBLISHED", "ARCHIVED"]),
  isPublished: z.boolean(),
  data: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = courseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid course details" }, { status: 400 });
  }

  const value = parsed.data;
  await query(
    `insert into course (
       id, slug, university_id, name, short_name, level, program_type, ugc_approved,
       stream, fee_inr, duration, status, is_published, data
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      value.id,
      value.slug,
      value.universityId,
      value.name,
      value.shortName,
      value.level,
      value.programType,
      value.ugcApproved,
      value.stream,
      value.feeInr,
      value.duration || null,
      value.status,
      value.isPublished,
      value.data,
    ],
  );

  await query(
    `insert into cms_audit_log (action, entity_type, entity_id, metadata)
     values ('COURSE_CREATED', 'course', $1, $2)`,
    [value.id, { universityId: value.universityId, status: value.status, isPublished: value.isPublished }],
  );

  return NextResponse.json({ id: value.id }, { status: 201 });
}
