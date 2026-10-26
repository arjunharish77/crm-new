import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ArticleEditor } from "@/components/article-editor";
import { ArticleReviewActions, ArticleStatusButton, RestoreRevisionButton } from "@/components/article-review-actions";
import { getAdminSession } from "@/lib/admin-auth";
import { AdminState, statusTone } from "@/components/admin-state";
import type { ArticleRevisionRow, ArticleRow } from "@/lib/article-revisions";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit article", robots: { index: false, follow: false, nocache: true } };

const REVISION_STATUS: Record<ArticleRevisionRow["status"], string> = { DRAFT: "Draft", NEEDS_REVIEW: "Waiting for review", APPLIED: "Published", REJECTED: "Sent back" };
const when = (value: string | null) => value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "";

export default async function ArticleAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const article = (await query<ArticleRow>("select * from article where id=$1", [id])).rows[0];
  if (!article) notFound();
  const revisions = (await query<ArticleRevisionRow & { author: string | null; reviewer: string | null }>(`select r.*, a.name as author, v.name as reviewer from article_revision r
    left join cms_user a on a.id=r.created_by left join cms_user v on v.id=r.reviewed_by where r.article_id=$1 order by r.created_at desc limit 50`, [id])).rows;
  const myDraft = revisions.find(r => r.status === "DRAFT" && r.created_by === session.userId);
  const waiting = revisions.filter(r => r.status === "NEEDS_REVIEW");
  const starting = myDraft?.content || article.content || revisions[0]?.content;
  if (!starting) notFound();
  const stale = myDraft && JSON.stringify(myDraft.base_content ?? null) !== JSON.stringify(article.content ?? null);
  return <section className="admin-shell"><div className="container">
    <div className="admin-page-head"><div><span className="eyebrow">Articles</span><h1>{starting.title || article.slug}</h1>
      <p>/blog/{article.slug} · {article.status === "PUBLISHED" ? "Published" : article.status === "ARCHIVED" ? "Unpublished" : "Not published yet"}
        {article.status === "PUBLISHED" ? <> · <Link href={`/blog/${article.slug}`} target="_blank">View live</Link></> : null}</p></div>
      {session.role === "ADMIN" && article.content && article.status !== "DRAFT" ? <ArticleStatusButton articleId={article.id} status={article.status} /> : null}
    </div>

    {waiting.length ? <section className="card article-review-queue" aria-labelledby="review-queue">
      <h2 id="review-queue">Waiting for review</h2>
      {waiting.map(revision => <article key={revision.id} className="article-review-item">
        <p><strong>{revision.author || "An editor"}</strong> · submitted {when(revision.submitted_at)}</p>
        <p>{revision.reason}</p>
        <p><a href={`/admin/articles/${article.id}/preview?revision=${revision.id}`} target="_blank" rel="noopener noreferrer">Preview this revision</a></p>
        {session.role === "ADMIN" ? <ArticleReviewActions revisionId={revision.id} scheduledFor={revision.scheduled_for} scheduleError={revision.schedule_error} />
          : <p>{revision.scheduled_for ? `Scheduled to go live on ${when(revision.scheduled_for)} (India time).` : "An administrator will review it."}</p>}
      </article>)}
    </section> : null}

    <section aria-labelledby="editor-heading">
      <h2 id="editor-heading">{myDraft ? "Your draft" : "Edit"}</h2>
      {stale ? <p className="admin-error" role="alert">The published article changed after you started this draft. Publishing it would undo those changes, so it will be refused. Restore the latest published version as your draft and redo your edits.</p> : null}
      <p>{myDraft ? `Saved ${when(myDraft.updated_at)}.` : "Your edits start from the published version and stay private until you submit them."}</p>
      <ArticleEditor articleId={article.id} slug={article.slug} initial={starting} initialReason={myDraft?.reason || ""} canEdit={session.role !== "VIEWER"} canPublish={session.role === "ADMIN"} hasDraft={Boolean(myDraft)}
        previewHref={myDraft ? `/admin/articles/${article.id}/preview?revision=${myDraft.id}` : undefined} />
    </section>

    <section className="card admin-section-gap admin-history-card" aria-labelledby="history-heading">
      <h2 id="history-heading">History</h2>
      <table className="checklist-table">
        <caption className="sr-only">Revisions, newest first</caption>
        <thead><tr><th scope="col">Change</th><th scope="col">Status</th><th scope="col">By</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{revisions.map(revision => <tr key={revision.id}>
          <th scope="row">{revision.reason || "No description"}<small>{when(revision.created_at)}</small></th>
          <td><AdminState tone={statusTone(revision.status)}>{REVISION_STATUS[revision.status]}</AdminState>{revision.status === "NEEDS_REVIEW" && revision.scheduled_for ? <small>Scheduled for {when(revision.scheduled_for)}</small> : null}{revision.review_note ? <small>{revision.reviewer ? `${revision.reviewer}: ` : ""}{revision.review_note}</small> : null}</td>
          <td>{revision.author || "Migration"}</td>
          <td><a href={`/admin/articles/${article.id}/preview?revision=${revision.id}`} target="_blank" rel="noopener noreferrer">Preview</a>{" "}
            {session.role !== "VIEWER" && revision.status === "APPLIED" ? <RestoreRevisionButton revisionId={revision.id} replacesDraft={Boolean(myDraft)} /> : null}</td>
        </tr>)}</tbody>
      </table>
    </section>
  </div></section>;
}
