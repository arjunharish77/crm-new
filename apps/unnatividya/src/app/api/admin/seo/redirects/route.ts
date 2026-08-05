import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { isInternalPath, normalizeRedirectPath } from "@/lib/redirects";

const schema = z.object({
  fromPath: z.string().trim().min(1),
  toPath: z.string().trim().min(1),
  statusCode: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]).default(301),
  reason: z.string().trim().max(500).optional().default(""),
  isActive: z.boolean().default(true),
});

function validatePaths(fromPath: string, toPath: string) {
  if (!isInternalPath(fromPath)) return "Source path must be an internal path starting with /.";
  if (fromPath.startsWith("/admin") || fromPath.startsWith("/api") || fromPath === "/lead") {
    return "Private CMS, API, and lead capture routes cannot be redirected.";
  }
  if (fromPath === toPath) return "Source and destination cannot be the same.";
  if (isInternalPath(toPath) && (toPath.startsWith("/admin") || toPath.startsWith("/api"))) {
    return "Destination cannot point to private CMS or API routes.";
  }
  return "";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid redirect details" }, { status: 400 });
  }

  const fromPath = normalizeRedirectPath(parsed.data.fromPath);
  const toPath = normalizeRedirectPath(parsed.data.toPath);
  const pathError = validatePaths(fromPath, toPath);
  if (pathError) return NextResponse.json({ error: pathError }, { status: 400 });

  const saved = await query<{ id: string }>(
    `insert into seo_redirect (from_path, to_path, status_code, reason, is_active)
     values ($1, $2, $3, $4, $5)
     on conflict (from_path) do update
       set to_path = excluded.to_path,
           status_code = excluded.status_code,
           reason = excluded.reason,
           is_active = excluded.is_active,
           updated_at = now()
     returning id`,
    [fromPath, toPath, parsed.data.statusCode, parsed.data.reason || null, parsed.data.isActive],
  );

  await query(
    `insert into cms_audit_log (action, entity_type, entity_id, metadata)
     values ('SEO_REDIRECT_UPSERTED', 'seo_redirect', $1, $2)`,
    [saved.rows[0].id, { fromPath, toPath, statusCode: parsed.data.statusCode, isActive: parsed.data.isActive }],
  );

  return NextResponse.json({ id: saved.rows[0].id, fromPath, toPath });
}
