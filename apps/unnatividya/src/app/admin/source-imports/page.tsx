import type { Metadata } from "next";
import Link from "next/link";
import { query } from "@/lib/db";

export const metadata: Metadata = {
  title: "Source Imports",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

type ImportRow = {
  id: string;
  source_name: string;
  source_url: string;
  status: string;
  fetched_at: string;
  item_count: number;
};

export default async function SourceImportsPage() {
  const imports = await query<ImportRow>(
    `select si.id, si.source_name, si.source_url, si.status, si.fetched_at, count(sii.id)::int as item_count
     from source_import si
     left join source_import_item sii on sii.source_import_id = si.id
     group by si.id
     order by si.fetched_at desc
     limit 100`,
  ).catch(() => ({ rows: [] as ImportRow[] }));

  return (
    <section className="admin-shell">
      <div className="container">
        <div className="admin-page-head">
          <div>
            <span className="eyebrow">CMS</span>
            <h1>Source imports</h1>
            <p>Review captured source pages before approving updates to public catalog content.</p>
          </div>
          <div className="admin-count">{imports.rows.length} imports</div>
        </div>

        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                {["Source", "Status", "Items", "Fetched", "URL", "Action"].map((head) => (
                  <th key={head}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {imports.rows.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.source_name}</strong><span>{item.id.slice(0, 8)}</span></td>
                  <td><span className={item.status === "FETCHED" ? "admin-status good" : "admin-status"}>{item.status}</span></td>
                  <td>{item.item_count}</td>
                  <td>{new Date(item.fetched_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                  <td><a className="text-link" href={item.source_url} target="_blank" rel="noreferrer">{item.source_url}</a></td>
                  <td><Link className="text-link" href={`/admin/source-imports/${item.id}`}>Review</Link></td>
                </tr>
              ))}
              {!imports.rows.length ? (
                <tr>
                  <td colSpan={6}>No source imports yet. Run `npm run unnatividya:source-import` after configuring network access.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
