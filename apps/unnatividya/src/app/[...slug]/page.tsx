import { notFound, permanentRedirect, redirect } from "next/navigation";
import { query } from "@/lib/db";
import { normalizeRedirectPath } from "@/lib/redirects";

export const dynamic = "force-dynamic";

type RedirectRow = {
  id: string;
  to_path: string;
  status_code: number;
};

export default async function RedirectFallbackPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const fromPath = normalizeRedirectPath(slug.join("/"));
  const result = await query<RedirectRow>(
    `select id, to_path, status_code
     from seo_redirect
     where from_path = $1
       and is_active = true
       and (starts_at is null or starts_at <= now())
       and (ends_at is null or ends_at >= now())
     limit 1`,
    [fromPath],
  ).catch(() => ({ rows: [] as RedirectRow[] }));

  const match = result.rows[0];
  if (!match) notFound();

  await query(
    `update seo_redirect
     set hit_count = hit_count + 1,
         last_hit_at = now(),
         updated_at = now()
     where id = $1`,
    [match.id],
  ).catch(() => null);

  const toPath = normalizeRedirectPath(match.to_path);
  if (match.status_code === 301 || match.status_code === 308) {
    permanentRedirect(toPath);
  }
  redirect(toPath);
}
