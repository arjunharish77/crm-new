import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SourceImportItemActions } from "@/components/source-import-item-actions";
import { query } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "Source Import Review",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

type ImportRow = {
  id: string;
  source_name: string;
  source_url: string;
  status: string;
  metadata: Record<string, unknown>;
  fetched_at: string;
};

type ImportItemRow = {
  id: string;
  entity_type: string;
  entity_key: string;
  source_url: string;
  source_hash: string | null;
  raw_data: Record<string, unknown>;
  review_status: string;
  created_at: string;
};

export default async function SourceImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const { id } = await params;
  const [importResult, itemsResult] = await Promise.all([
    query<ImportRow>(
      `select id, source_name, source_url, status, metadata, fetched_at
       from source_import
       where id = $1
       limit 1`,
      [id],
    ),
    query<ImportItemRow>(
      `select id, entity_type, entity_key, source_url, source_hash, raw_data, review_status, created_at
       from source_import_item
       where source_import_id = $1
       order by created_at desc`,
      [id],
    ),
  ]);
  const importRow = importResult.rows[0];
  if (!importRow) notFound();

  return (
    <section className="admin-shell source-review-page">
      <div className="container">
        <div className="admin-page-head">
          <div>
            <span className="eyebrow">CMS</span>
            <h1>{importRow.source_name}</h1>
            <p>{importRow.source_url}</p>
          </div>
          <Link className="btn ghost" href="/admin/source-imports">Back to imports</Link>
        </div>

        <div className="admin-detail-grid">
          <section className="card admin-detail-card">
            <h2>Import metadata</h2>
            <div className="admin-detail-fields">
              <div className="admin-detail-field"><span>Status</span><strong><span className="admin-status">{importRow.status}</span></strong></div>
              <div className="admin-detail-field"><span>Fetched</span><strong>{new Date(importRow.fetched_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</strong></div>
              <div className="admin-detail-field"><span>Source URL</span><strong><a className="text-link" href={importRow.source_url} target="_blank" rel="noreferrer">{importRow.source_url}</a></strong></div>
            </div>
            <details className="source-review-disclosure"><summary>Technical import metadata</summary><pre className="admin-json">{JSON.stringify(importRow.metadata, null, 2)}</pre></details>
          </section>

          <section className="card admin-detail-card">
            <h2>Review guidance</h2>
            <p>Use official provider rows for fees, eligibility, approvals, and admissions. College Vidya rows are reference-only for taxonomy and keyword validation.</p>
            <p>Marking an item reviewed records a review decision. Attaching source notes stores evidence on a course or university record; it does not replace the public facts. Submit factual changes through catalog revisions for administrator review.</p>
          </section>
        </div>

        <section aria-labelledby="source-items-title" className="source-review-items">
          <h2 id="source-items-title">Captured items ({itemsResult.rows.length})</h2>
          {itemsResult.rows.map((item, index) => {
            const parsed = (item.raw_data?.parsed || {}) as { title?: string; facts?: unknown };
            const referenceOnly = item.raw_data?.mode === "REFERENCE_TAXONOMY_ONLY" || item.entity_type === "reference_taxonomy";
            const eligible = ["course", "university"].includes(item.entity_type) && !referenceOnly;
            const facts = parsed.facts && typeof parsed.facts === "object" && !Array.isArray(parsed.facts) ? Object.entries(parsed.facts) : [];
            return <article className="card admin-detail-card source-review-item" aria-labelledby={`source-item-${index}`} key={item.id}>
              <header className="source-review-item-head">
                <div><h3 id={`source-item-${index}`}>{item.entity_key}</h3><p>{item.entity_type}{referenceOnly ? " · Reference only" : ""}</p></div>
                <span className="admin-status">{item.review_status}</span>
              </header>
              <p><a className="text-link" href={item.source_url} target="_blank" rel="noreferrer">Open captured source (new tab)</a></p>
              <h4>{parsed.title || "No page title parsed"}</h4>
              {facts.length ? <dl className="source-review-facts">{facts.map(([key, value]) => <div key={key}><dt>{key.replace(/[_-]/g, " ")}</dt><dd>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</dd></div>)}</dl> : <p className="admin-muted">No structured facts were extracted. Inspect the captured data and source before marking this item reviewed.</p>}
              <details className="source-review-disclosure"><summary>Captured data and source hash</summary><p>Source hash: {item.source_hash || "Not available"}</p><pre className="admin-json">{JSON.stringify(item.raw_data, null, 2)}</pre></details>
              <SourceImportItemActions itemId={item.id} canReview={session.role === "ADMIN" || session.role === "EDITOR"} canApply={session.role === "ADMIN" && eligible} referenceOnly={referenceOnly} />
              {eligible && <Link className="text-link source-review-record" href={`/admin/catalog-revisions?type=${item.entity_type}&id=${encodeURIComponent(item.entity_key)}`}>Review {item.entity_type} content</Link>}
            </article>;
          })}
          {!itemsResult.rows.length && <p className="card admin-detail-card">No items were captured for this source.</p>}
        </section>
      </div>
    </section>
  );
}
