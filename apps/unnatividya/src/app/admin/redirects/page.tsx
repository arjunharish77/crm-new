import type { Metadata } from "next";
import { query } from "@/lib/db";
import { RedirectCreateForm, RedirectRowActions } from "@/components/redirect-manager-actions";

export const metadata: Metadata = {
  title: "Redirect Manager",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

type RedirectRow = {
  id: string;
  from_path: string;
  to_path: string;
  status_code: number;
  reason: string | null;
  is_active: boolean;
  hit_count: number;
  last_hit_at: string | null;
  updated_at: string;
};

export default async function RedirectsPage() {
  const redirects = await query<RedirectRow>(
    `select id, from_path, to_path, status_code, reason, is_active, hit_count, last_hit_at, updated_at
     from seo_redirect
     order by is_active desc, updated_at desc, id desc`,
  );

  return (
    <section className="admin-shell content-quality redirect-manager">
      <div className="container">
        <div className="admin-page-head">
          <div>
            <span className="eyebrow">SEO Controls</span>
            <h1>Redirect manager</h1>
            <p>Protect SEO equity when slugs change, campaign URLs expire, or duplicate URLs need a canonical destination.</p>
          </div>
          <div className="admin-count">{redirects.rows.length} redirects</div>
        </div>

        <section className="card admin-detail-card">
          <h2>Create or update redirect</h2>
          <RedirectCreateForm />
        </section>

        <section aria-labelledby="configured-redirects" style={{ marginTop: 24 }}>
          <h2 id="configured-redirects">Configured redirects</h2>
          <div className="quality-records">{redirects.rows.map(redirect => <article className="card quality-record" key={redirect.id}>
            <div><span className={redirect.is_active ? "admin-status good" : "admin-status"}>{redirect.is_active ? "Active" : "Inactive"}</span><h3>{redirect.from_path}</h3></div>
            <dl><div><dt>Destination</dt><dd>{redirect.to_path}</dd></div><div><dt>HTTP status</dt><dd>{redirect.status_code} · {[301,308].includes(redirect.status_code) ? "Permanent" : "Temporary"}</dd></div><div><dt>Recorded hits</dt><dd>{redirect.hit_count}</dd></div><div><dt>Last hit (India time)</dt><dd>{redirect.last_hit_at ? new Date(redirect.last_hit_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "No hits recorded"}</dd></div></dl>
            <p>{redirect.reason || "No reason added"}</p>
            <RedirectRowActions redirect={redirect} />
          </article>)}</div>
          {!redirects.rows.length && <p className="card quality-empty">No redirects configured. Add an old path and its destination above.</p>}
        </section>
      </div>
    </section>
  );
}
