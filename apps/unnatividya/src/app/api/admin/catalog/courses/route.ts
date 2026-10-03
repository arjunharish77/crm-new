import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-auth";
import { withCatalogWrite } from "@/lib/catalog-write";
import { catalogWriteError } from "@/lib/catalog-permissions";

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
  // F26 fix (WP16): proxy.ts already blocks anonymous/expired requests to /api/admin/*, but only
  // checks the cookie's own signature+expiry -- it can't reach Postgres from the edge runtime, so
  // it never notices a deactivated admin or a forced revocation. This authoritative, DB-backed
  // check is the second half of that fix; see getAdminSession's own comment for the full reasoning.
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "CMS admin login required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = courseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid course details" }, { status: 400 });
  }

  const value = parsed.data;
  const permissionError = catalogWriteError(session.role, value);
  if (permissionError) return NextResponse.json({ error: permissionError }, { status: 403 });
  if (value.isPublished !== (value.status === "PUBLISHED")) {
    return NextResponse.json({ error: "Published status and public visibility must agree." }, { status: 400 });
  }
  return withCatalogWrite(async (query) => {
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
  });
}
