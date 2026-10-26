import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { codeGuide, type GuideKind } from "@/lib/guide-cms";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Guides", robots: { index: false, follow: false, nocache: true } };

const KIND: Record<GuideKind, string> = { eligibility: "Eligibility", "career-scope": "Career scope" };

// Wave 5 C3: the eligibility and career-scope guides whose text is edited in the CMS.
export default async function GuidesPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const rows = (await query<{ id: string; kind: GuideKind; guide_key: string; updated_at: string; reviews: number; drafts: number }>(`
    select g.id, g.kind, g.guide_key, g.updated_at,
      (select count(*)::int from guide_revision r where r.guide_id=g.id and r.status='NEEDS_REVIEW') as reviews,
      (select count(*)::int from guide_revision r where r.guide_id=g.id and r.status='DRAFT') as drafts
    from guide g order by (select count(*) from guide_revision r where r.guide_id=g.id and r.status='NEEDS_REVIEW') desc, g.kind, g.guide_key`)).rows;
  const waiting = rows.reduce((sum, row) => sum + row.reviews, 0);
  return <section className="admin-shell"><div className="container">
    <div className="admin-page-head"><div><span className="eyebrow">Content</span><h1>Guides</h1>
      <p>Edit a guide to start your own draft of its text. Submitted drafts wait here for an administrator to publish them; nothing changes on the site until then. Administrators can also save and publish their own changes in one step, or publish every ready revision from the publishing checklist. New guides are added in code, after research.</p></div></div>
    {!rows.length ? <p className="admin-notice" role="status">No guides are in the CMS yet. Run <code>node scripts/sync-guides-to-db.js</code> once after the migration; until then the site shows the guides&apos; built-in text.</p> : <>
      <ul className="checklist-summary" aria-label="Guides"><li><strong>{rows.length}</strong> guides</li><li><strong>{waiting}</strong> waiting for review</li></ul>
      <div className="card admin-table-region">
        <table className="checklist-table">
          <caption className="sr-only">All guides</caption>
          <thead><tr><th scope="col">Guide</th><th scope="col">Type</th><th scope="col">Open changes</th><th scope="col">Last published change</th></tr></thead>
          <tbody>{rows.map(row => {
            const guide = codeGuide(row.kind, row.guide_key);
            return <tr key={row.id}>
              <th scope="row"><Link href={`/admin/guides/${row.id}`}>{guide ? `${guide.label} ${row.kind === "eligibility" ? "eligibility" : "career scope"}` : row.guide_key}</Link><small>/online-degree-guides/{guide?.slug || row.guide_key}</small></th>
              <td>{KIND[row.kind]}</td>
              <td>{row.reviews ? <strong>{row.reviews} to review</strong> : null}{row.reviews && row.drafts ? " · " : null}{row.drafts ? `${row.drafts} draft${row.drafts > 1 ? "s" : ""}` : null}{!row.reviews && !row.drafts ? "None" : null}</td>
              <td>{new Date(row.updated_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </>}
  </div></section>;
}
