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
export default async function CatalogRevisionsPage({ searchParams }: { searchParams: Promise<{ type?:string;id?:string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const params = await searchParams;
  const type = entityTypeSchema.safeParse(params.type);
  if ((params.type || params.id) && (!type.success || !params.id)) notFound();
  const entityType = type.success ? type.data : undefined;
  const snapshot = entityType ? (await query<{ snapshot:Record<string,unknown> }>(`select to_jsonb(t) as snapshot from ${entityType} t where id=$1`,[params.id])).rows[0]?.snapshot : undefined;
  if (entityType && !snapshot) notFound();
  const workingDraft = entityType && session.role !== "VIEWER" ? (await query<CatalogWorkingDraft>("select id,entity_type,entity_id,base_snapshot,proposed_content,reason,version from catalog_working_draft where created_by=$1 and entity_type=$2 and entity_id=$3", [session.userId,entityType,params.id])).rows[0] : undefined;
  const revisions = await query<CatalogRevision>(`select * from catalog_revision ${entityType ? "where entity_type=$1 and entity_id=$2" : ""} order by created_at desc limit 50`,entityType ? [entityType,params.id] : []);
  // pg returns timestamps as Dates; normalize before passing to the client.
  const rows = revisions.rows.map(row=>({...row,created_at:new Date(row.created_at).toISOString()}));
  return <section className="admin-shell"><div className="container"><div className="admin-page-head"><div><span className="eyebrow">CMS review</span><h1>Catalog revisions</h1><p>{snapshot ? String(snapshot.name) : "Review proposed course and university changes."}</p></div></div>
    {entityType === "course" && params.id ? <FeeReviewNotice courseId={params.id} /> : null}
    <CatalogRevisionPanel workingDraft={workingDraft} eligibilityIssue={entityType==="course"?eligibilityIssues.find(issue=>issue.courseId===params.id):undefined} key={snapshot ? JSON.stringify(snapshot) : "all"} role={session.role} entityType={entityType} entityId={params.id} snapshot={snapshot} revisions={rows} eligibilityDraft={entityType==="course"?preparedEligibility.find(draft=>draft.courseId===params.id):undefined} feeCorrection={entityType==="course"?preparedFees.find(draft=>draft.courseId===params.id):undefined} curriculumDraft={entityType==="course"?preparedCurricula.find(draft=>draft.courseId===params.id):undefined}/>
  </div></section>;
}
