import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SourceImportItemActions } from "@/components/source-import-item-actions";
import { query } from "@/lib/db";

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
  const { id } = await params;
  const [importResult, itemsResult] = await Promise.all([
    query<ImportRow>(
      `select id, source_name, source_url, status, metadata, fetched_at
       from source_import
       where id = $1
       limit 1`,
      [id],
    ).catch(() => ({ rows: [] as ImportRow[] })),
    query<ImportItemRow>(
      `select id, entity_type, entity_key, source_url, source_hash, raw_data, review_status, created_at
       from source_import_item
       where source_import_id = $1
       order by created_at desc`,
      [id],
    ).catch(() => ({ rows: [] as ImportItemRow[] })),
  ]);
  const importRow = importResult.rows[0];
  if (!importRow) notFound();

  return (
    <section className="admin-shell">
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
            <pre className="admin-json">{JSON.stringify(importRow.metadata, null, 2)}</pre>
          </section>

          <section className="card admin-detail-card">
            <h2>Review guidance</h2>
            <p>Use official provider rows for fees, eligibility, approvals, and admissions. College Vidya rows are reference-only for taxonomy and keyword validation.</p>
            <p>No imported value is applied to public catalog data until a reviewer copies/approves it in the university or course CMS editor.</p>
          </section>
        </div>

        <div className="admin-table-card" style={{ marginTop: 18 }}>
          <table className="admin-table">
            <thead>
              <tr>
                {["Entity", "Review", "Hash", "Parsed facts", "Actions", "Raw"].map((head) => (
                  <th key={head}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itemsResult.rows.map((item) => {
                const parsed = (item.raw_data.parsed || {}) as { title?: string; facts?: unknown };
                const canApply = item.entity_type === "course" || item.entity_type === "university";
                return (
                  <tr key={item.id}>
                    <td><strong>{item.entity_key}</strong><span>{item.entity_type}</span></td>
                    <td><span className="admin-status">{item.review_status}</span></td>
                    <td>{item.source_hash?.slice(0, 12) || "-"}</td>
                    <td>
                      <strong>{parsed.title || "No title parsed"}</strong>
                      <pre className="admin-json">{JSON.stringify(parsed.facts || {}, null, 2)}</pre>
                    </td>
                    <td>
                      <SourceImportItemActions itemId={item.id} canApply={canApply && item.raw_data.mode !== "REFERENCE_TAXONOMY_ONLY"} />
                    </td>
                    <td><pre className="admin-json">{JSON.stringify(item.raw_data, null, 2)}</pre></td>
                  </tr>
                );
              })}
              {!itemsResult.rows.length ? (
                <tr>
                  <td colSpan={6}>No import items captured for this source.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
