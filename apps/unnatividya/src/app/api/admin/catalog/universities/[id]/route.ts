import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";

const universitySchema = z.object({
  slug: z.string().trim().min(2),
  name: z.string().trim().min(2),
  shortName: z.string().trim().min(1),
  city: z.string().trim().optional().default(""),
  status: z.enum(["DRAFT", "NEEDS_REVIEW", "PUBLISHED", "ARCHIVED"]),
  isPublished: z.boolean(),
  data: z.record(z.string(), z.unknown()).default({}),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = universitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid university details" }, { status: 400 });
  }

  const value = parsed.data;
  const saved = await query<{ id: string }>(
    `update university
     set slug = $1,
         name = $2,
         short_name = $3,
         city = $4,
         status = $5,
         is_published = $6,
         data = $7,
         updated_at = now()
     where id = $8
     returning id`,
    [
      value.slug,
      value.name,
      value.shortName,
      value.city || null,
      value.status,
      value.isPublished,
      value.data,
      id,
    ],
  );

  if (!saved.rowCount) {
    return NextResponse.json({ error: "University not found" }, { status: 404 });
  }

  await query(
    `insert into cms_audit_log (action, entity_type, entity_id, metadata)
     values ('UNIVERSITY_UPDATED', 'university', $1, $2)`,
    [id, { status: value.status, isPublished: value.isPublished }],
  );

  return NextResponse.json({ id });
}
