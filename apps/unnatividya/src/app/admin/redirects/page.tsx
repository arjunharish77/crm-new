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
     order by is_active desc, updated_at desc`,
  ).catch(() => ({ rows: [] as RedirectRow[] }));

  return (
    <section className="admin-shell">
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

        <section className="admin-table-card" style={{ marginTop: 18 }}>
          <table className="admin-table">
            <thead>
              <tr>
                {["From", "To", "Status", "Hits", "Last hit", "State", "Actions"].map((head) => <th key={head}>{head}</th>)}
              </tr>
            </thead>
            <tbody>
              {redirects.rows.map((redirect) => (
                <tr key={redirect.id}>
                  <td><strong>{redirect.from_path}</strong><span>{redirect.reason || "No reason added"}</span></td>
                  <td>{redirect.to_path}</td>
                  <td>{redirect.status_code}</td>
                  <td>{redirect.hit_count}</td>
                  <td>{redirect.last_hit_at ? new Date(redirect.last_hit_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "-"}</td>
                  <td><span className={redirect.is_active ? "admin-status good" : "admin-status"}>{redirect.is_active ? "Active" : "Inactive"}</span></td>
                  <td><RedirectRowActions redirect={redirect} /></td>
                </tr>
              ))}
              {!redirects.rows.length ? (
                <tr>
                  <td colSpan={7}>No redirects configured.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </section>
  );
}
