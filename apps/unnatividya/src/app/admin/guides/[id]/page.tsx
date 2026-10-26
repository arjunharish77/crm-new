import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AdminState, statusTone } from "@/components/admin-state";
import { GuideEditor } from "@/components/guide-editor";
import { GuideReviewActions, RestoreGuideButton } from "@/components/guide-review-actions";
import { universities } from "@/data/catalog";
import { getAdminSession } from "@/lib/admin-auth";
import { codeGuide } from "@/lib/guide-cms";
import type { GuideRevisionRow, GuideRow } from "@/lib/guide-revisions";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit guide", robots: { index: false, follow: false, nocache: true } };

const REVISION_STATUS: Record<GuideRevisionRow["status"], string> = { DRAFT: "Draft", NEEDS_REVIEW: "Waiting for review", APPLIED: "Published", REJECTED: "Sent back" };
const when = (value: string | null) => value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "";

// Wave 5 C3: one guide's review queue, the editor and the history, as for articles.
export default async function GuideAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const guide = (await query<GuideRow>("select * from guide where id=$1", [id])).rows[0];
  const meta = guide ? codeGuide(guide.kind, guide.guide_key) : null;
  if (!guide || !meta) notFound();
  const revisions = (await query<GuideRevisionRow & { author: string | null; reviewer: string | null }>(`select r.*, a.name as author, v.name as reviewer from guide_revision r
    left join cms_user a on a.id=r.created_by left join cms_user v on v.id=r.reviewed_by where r.guide_id=$1 order by r.created_at desc limit 50`, [id])).rows;
  const myDraft = revisions.find(r => r.status === "DRAFT" && r.created_by === session.userId);
  const waiting = revisions.filter(r => r.status === "NEEDS_REVIEW");
  const stale = myDraft && JSON.stringify(myDraft.base_content ?? null) !== JSON.stringify(guide.content ?? null);
  const publicPath = `/online-degree-guides/${meta.slug}`;
  const preview = (revisionId: string) => `${publicPath}?preview=${revisionId}`;
  const names = Object.fromEntries(universities.map(university => [university.id, university.name]));
  return <section className="admin-shell"><div className="container">
    <div className="admin-page-head"><div><span className="eyebrow">Guides</span><h1>{meta.label} {guide.kind === "eligibility" ? "eligibility" : "career scope"}</h1>
      <p>{publicPath} · <Link href={publicPath} target="_blank">View live</Link></p></div></div>

    {waiting.length ? <section className="card article-review-queue" aria-labelledby="review-queue">
      <h2 id="review-queue">Waiting for review</h2>
      {waiting.map(revision => <article key={revision.id} className="article-review-item">
        <p><strong>{revision.author || "An editor"}</strong> · submitted {when(revision.submitted_at)}</p>
        <p>{revision.reason}</p>
        <p><a href={preview(revision.id)} target="_blank" rel="noopener noreferrer">Preview this revision</a></p>
        {session.role === "ADMIN" ? <GuideReviewActions revisionId={revision.id} /> : <p>An administrator will review it.</p>}
      </article>)}
    </section> : null}

    <section aria-labelledby="editor-heading">
      <h2 id="editor-heading">{myDraft ? "Your draft" : "Edit"}</h2>
      {stale ? <p className="admin-error" role="alert">The published guide changed after you started this draft. Publishing it would undo those changes, so it will be refused. Restore the latest published version as your draft and redo your edits.</p> : null}
      <p>{myDraft ? `Saved ${when(myDraft.updated_at)}.` : "Your edits start from the published text and stay private until you submit them."}</p>
      <GuideEditor guideId={guide.id} kind={guide.kind} initial={myDraft?.content || guide.content} initialReason={myDraft?.reason || ""} universityNames={names}
        canEdit={session.role !== "VIEWER"} canPublish={session.role === "ADMIN"} hasDraft={Boolean(myDraft)} previewHref={myDraft ? preview(myDraft.id) : undefined} />
    </section>

    <section className="card admin-section-gap admin-history-card" aria-labelledby="history-heading">
      <h2 id="history-heading">History</h2>
      <table className="checklist-table">
        <caption className="sr-only">Revisions, newest first</caption>
        <thead><tr><th scope="col">Change</th><th scope="col">Status</th><th scope="col">By</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{revisions.map(revision => <tr key={revision.id}>
          <th scope="row">{revision.reason || "No description"}<small>{when(revision.created_at)}</small></th>
          <td><AdminState tone={statusTone(revision.status)}>{REVISION_STATUS[revision.status]}</AdminState>{revision.review_note ? <small>{revision.reviewer ? `${revision.reviewer}: ` : ""}{revision.review_note}</small> : null}</td>
          <td>{revision.author || "Migration"}</td>
          <td><a href={preview(revision.id)} target="_blank" rel="noopener noreferrer">Preview</a>{" "}
            {session.role !== "VIEWER" && revision.status === "APPLIED" ? <RestoreGuideButton revisionId={revision.id} replacesDraft={Boolean(myDraft)} /> : null}</td>
        </tr>)}</tbody>
      </table>
    </section>
  </div></section>;
}
