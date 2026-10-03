import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-auth";
import { withCatalogWrite } from "@/lib/catalog-write";
import { catalogWriteError } from "@/lib/catalog-permissions";

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
  // F26 fix (WP16): DB-backed session check -- see getAdminSession in src/lib/admin-auth.ts for
  // why proxy.ts's cookie-only check on /api/admin/* isn't sufficient by itself.
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "CMS admin login required" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = universitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid university details" }, { status: 400 });
  }

  const value = parsed.data;
  const permissionError = catalogWriteError(session.role, value);
  if (permissionError) return NextResponse.json({ error: permissionError }, { status: 403 });
  if (value.isPublished !== (value.status === "PUBLISHED")) {
    return NextResponse.json({ error: "Published status and public visibility must agree." }, { status: 400 });
  }
  return withCatalogWrite(async (query) => {
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
       and ($9 = 'ADMIN' or (not is_published and status in ('DRAFT', 'NEEDS_REVIEW')))
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
      session.role,
    ],
  );

  if (!saved.rowCount) {
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Record unavailable for draft editing. Published and archived records require an administrator." }, { status: 403 });
    }
    return NextResponse.json({ error: "University not found" }, { status: 404 });
  }

  await query(
    `insert into cms_audit_log (action, entity_type, entity_id, metadata)
     values ('UNIVERSITY_UPDATED', 'university', $1, $2)`,
    [id, { status: value.status, isPublished: value.isPublished }],
  );

  return NextResponse.json({ id });
  });
}
