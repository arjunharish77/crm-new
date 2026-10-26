import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { AdminState, statusTone } from "@/components/admin-state";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Articles", robots: { index: false, follow: false, nocache: true } };

const STATUS: Record<string, string> = { DRAFT: "Not published", PUBLISHED: "Published", ARCHIVED: "Unpublished" };

export default async function ArticlesPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const rows = (await query<{ id: string; slug: string; status: string; title: string | null; draft_title: string | null; updated_at: string; reviews: number; drafts: number; next_publish: string | null }>(`
    select a.id, a.slug, a.status, a.content->>'title' as title, a.updated_at,
      (select content->>'title' from article_revision r where r.article_id=a.id order by r.created_at desc limit 1) as draft_title,
      (select count(*)::int from article_revision r where r.article_id=a.id and r.status='NEEDS_REVIEW') as reviews,
      (select count(*)::int from article_revision r where r.article_id=a.id and r.status='DRAFT') as drafts,
      (select min(scheduled_for) from article_revision r where r.article_id=a.id and r.status='NEEDS_REVIEW') as next_publish
    from article a order by (select count(*) from article_revision r where r.article_id=a.id and r.status='NEEDS_REVIEW') desc, a.updated_at desc`)).rows;
  const waiting = rows.reduce((sum, row) => sum + row.reviews, 0);
  return <section className="admin-shell"><div className="container">
    <div className="admin-page-head"><div><span className="eyebrow">Content</span><h1>Articles</h1>
      <p>Edit an article to start your own draft. Submitted drafts wait here for an administrator to publish them; nothing changes on the site until then. Administrators can also save and publish their own changes in one step, or publish every ready revision from the publishing checklist.</p></div>
      {session.role !== "VIEWER" ? <Link className="btn primary" href="/admin/articles/new">New article</Link> : null}
    </div>
    <ul className="checklist-summary" aria-label="Articles"><li><strong>{rows.filter(r => r.status === "PUBLISHED").length}</strong> published</li><li><strong>{waiting}</strong> waiting for review</li><li><strong>{rows.filter(r => r.next_publish).length}</strong> scheduled</li></ul>
    <div className="card admin-table-region">
      <table className="checklist-table">
        <caption className="sr-only">All articles</caption>
        <thead><tr><th scope="col">Article</th><th scope="col">Status</th><th scope="col">Open changes</th><th scope="col">Last published change</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
          <th scope="row"><Link href={`/admin/articles/${row.id}`}>{row.title || row.draft_title || row.slug}</Link><small>/blog/{row.slug}</small></th>
          <td><AdminState tone={statusTone(row.status)}>{STATUS[row.status]}</AdminState></td>
          <td>{row.reviews ? <strong>{row.reviews} to review</strong> : null}{row.reviews && row.drafts ? " · " : null}{row.drafts ? `${row.drafts} draft${row.drafts > 1 ? "s" : ""}` : null}{!row.reviews && !row.drafts ? "None" : null}{row.next_publish ? <small>Scheduled for {new Date(row.next_publish).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</small> : null}</td>
          <td>{new Date(row.updated_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div></section>;
}
