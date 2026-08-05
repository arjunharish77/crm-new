import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";

const universitySchema = z.object({
  id: z.string().trim().min(2).regex(/^[a-z0-9-]+$/),
  slug: z.string().trim().min(2).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2),
  shortName: z.string().trim().min(1),
  city: z.string().trim().optional().default(""),
  status: z.enum(["DRAFT", "NEEDS_REVIEW", "PUBLISHED", "ARCHIVED"]),
  isPublished: z.boolean(),
  data: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = universitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid university details" }, { status: 400 });
  }

  const value = parsed.data;
  await query(
    `insert into university (id, slug, name, short_name, city, status, is_published, data)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      value.id,
      value.slug,
      value.name,
      value.shortName,
      value.city || null,
      value.status,
      value.isPublished,
      value.data,
    ],
  );

  await query(
    `insert into cms_audit_log (action, entity_type, entity_id, metadata)
     values ('UNIVERSITY_CREATED', 'university', $1, $2)`,
    [value.id, { status: value.status, isPublished: value.isPublished }],
  );

  return NextResponse.json({ id: value.id }, { status: 201 });
}
