import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";

const courseSchema = z.object({
  slug: z.string().trim().min(2),
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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = courseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid course details" }, { status: 400 });
  }

  const value = parsed.data;
  const saved = await query<{ id: string }>(
    `update course
     set slug = $1,
         university_id = $2,
         name = $3,
         short_name = $4,
         level = $5,
         program_type = $6,
         ugc_approved = $7,
         stream = $8,
         fee_inr = $9,
         duration = $10,
         status = $11,
         is_published = $12,
         data = $13,
         updated_at = now()
     where id = $14
     returning id`,
    [
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
      id,
    ],
  );

  if (!saved.rowCount) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  await query(
    `insert into cms_audit_log (action, entity_type, entity_id, metadata)
     values ('COURSE_UPDATED', 'course', $1, $2)`,
    [id, { status: value.status, isPublished: value.isPublished }],
  );

  return NextResponse.json({ id });
}
