import Link from "next/link";
import { FeeReviewNotice } from "@/components/fee-review-notice";
import type { CatalogWorkingDraft } from "@/lib/catalog-working-drafts";
import eligibilityIssues from "@/data/eligibility-review-issues.json";
import preparedEligibility from "@/data/prepared-eligibility-drafts.json";
import preparedFees from "@/data/prepared-fee-corrections.json";
import preparedCurricula from "@/data/prepared-curriculum-drafts.json";
import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { query } from "@/lib/db";
import { entityTypeSchema, type CatalogRevision } from "@/lib/catalog-revisions";
import { CatalogRevisionPanel } from "@/components/catalog-revision-panel";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Catalog revisions", robots: { index:false,follow:false,nocache:true } };
export default async function CatalogRevisionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const rawParams = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || "";
  const params = { type: first(rawParams.type), id: first(rawParams.id) };
  const q = first(rawParams.q).trim().slice(0, 200);
  const status = ["NEEDS_REVIEW", "APPLIED", "REJECTED"].includes(first(rawParams.status)) ? first(rawParams.status) : "";
  const type = entityTypeSchema.safeParse(params.type);
  if ((params.type || params.id) && (!type.success || !params.id)) notFound();
  const entityType = type.success ? type.data : undefined;
  const snapshot = entityType ? (await query<{ snapshot:Record<string,unknown> }>(`select to_jsonb(t) as snapshot from ${entityType} t where id=$1`,[params.id])).rows[0]?.snapshot : undefined;
  if (entityType && !snapshot) notFound();
  const workingDraft = entityType && session.role !== "VIEWER" ? (await query<CatalogWorkingDraft>("select id,entity_type,entity_id,base_snapshot,proposed_content,reason,version from catalog_working_draft where created_by=$1 and entity_type=$2 and entity_id=$3", [session.userId,entityType,params.id])).rows[0] : undefined;
  const where = `($1 = '' or (entity_type=$1 and entity_id=$2)) and ($3 = '' or status=$3) and ($4 = '' or reason ilike $5 or entity_id ilike $5 or id::text ilike $5)`;
  const values = [entityType || "", params.id, status, q, `%${q.replace(/[\\%_]/g, "\\$&")}%`];
  const total = (await query<{ total: number }>(`select count(*)::int as total from catalog_revision where ${where}`, values)).rows[0].total;
  const pages = Math.max(1, Math.ceil(total / 20));
  const requested = Number(first(rawParams.page));
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, pages) : 1;
  const revisions = await query<CatalogRevision>(`select * from catalog_revision where ${where} order by created_at desc, id desc limit $6 offset $7`, [...values, 20, (page - 1) * 20]);
  function historyHref(target?: number, clear = false) {
    const next = new URLSearchParams();
    if (entityType) { next.set("type", entityType); next.set("id", params.id); }
    if (!clear) { if (q) next.set("q", q); if (status) next.set("status", status); }
    if (target) next.set("page", String(target));
    return `/admin/catalog-revisions?${next}#revision-history`;
  }
  const historyControls = <>
    <p>Save any working draft before navigating history filters or pages.</p>
    <form className="card quality-filters" action="/admin/catalog-revisions#revision-history" method="get" role="search" aria-label="Filter revision history">
      {entityType && <><input type="hidden" name="type" value={entityType} /><input type="hidden" name="id" value={params.id} /></>}
      <div><label htmlFor="revision-query">Reason, record or revision ID</label><input id="revision-query" name="q" type="search" maxLength={200} defaultValue={q} /></div>
      <div><label htmlFor="revision-status">Review status</label><select id="revision-status" name="status" defaultValue={status}><option value="">All statuses</option><option value="NEEDS_REVIEW">Needs review</option><option value="APPLIED">Applied</option><option value="REJECTED">Rejected</option></select></div>
      <div className="quality-filter-actions"><button className="btn primary" type="submit">Filter history</button>{(q || status) && <Link className="text-link" href={historyHref(undefined,true)}>Clear history filters</Link>}</div>
    </form>
    <p role="status">{total ? `Showing ${(page - 1) * 20 + 1}–${Math.min(page * 20,total)} of ${total} matching revisions` : "No matching revisions"}{entityType ? " for this record." : " across the catalog."}</p>
  </>;
  const historyPagination = pages > 1 ? <nav className="source-import-pagination" aria-label="Revision history pages">{page > 1 && <Link className="btn ghost" href={historyHref(page - 1)}>Previous page</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link className="btn ghost" href={historyHref(page + 1)}>Next page</Link>}</nav> : null;
  // pg returns timestamps as Dates; normalize before passing to the client.
  const rows = revisions.rows.map(row=>({...row,created_at:new Date(row.created_at).toISOString()}));
  return <section className="admin-shell"><div className="container"><div className="admin-page-head"><div><span className="eyebrow">CMS review</span><h1>Catalog revisions</h1><p>{snapshot ? String(snapshot.name) : "Review proposed course and university changes."}</p></div></div>
    {entityType === "course" && params.id ? <FeeReviewNotice courseId={params.id} /> : null}
    <CatalogRevisionPanel historyControls={historyControls} historyPagination={historyPagination} workingDraft={workingDraft} eligibilityIssue={entityType==="course"?eligibilityIssues.find(issue=>issue.courseId===params.id):undefined} key={snapshot ? JSON.stringify(snapshot) : "all"} role={session.role} entityType={entityType} entityId={params.id} snapshot={snapshot} revisions={rows} eligibilityDraft={entityType==="course"?preparedEligibility.find(draft=>draft.courseId===params.id):undefined} feeCorrection={entityType==="course"?preparedFees.find(draft=>draft.courseId===params.id):undefined} curriculumDraft={entityType==="course"?preparedCurricula.find(draft=>draft.courseId===params.id):undefined}/>
  </div></section>;
}
