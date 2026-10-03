"use client";
import Link from "next/link";
import type { CatalogWorkingDraft } from "@/lib/catalog-working-drafts";
import { EligibilityReviewNotice, type EligibilityReviewIssue } from "@/components/eligibility-review-notice";
import type { PreparedEligibility } from "@/lib/prepared-eligibility";
import type { PreparedFeeCorrection } from "@/lib/prepared-fee-correction";
import type { PreparedCurriculumDraft } from "@/lib/prepared-curriculum";
import { CatalogContentEditor } from "@/components/catalog-content-editor";
import { normalizeEditorialContent, editorialChanges, editorialDisplay } from "@/lib/catalog-editor";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { revisionContent, type CatalogEntityType, type CatalogRevision } from "@/lib/catalog-revisions";
import type { CatalogRole } from "@/lib/catalog-permissions";

export function CatalogRevisionPanel({ role, entityType, entityId, snapshot, revisions, curriculumDraft, feeCorrection, eligibilityDraft, eligibilityIssue, workingDraft }: {
  role: CatalogRole; entityType?: CatalogEntityType; entityId?: string;
  snapshot?: Record<string, unknown>; revisions: CatalogRevision[]; curriculumDraft?: PreparedCurriculumDraft; feeCorrection?: PreparedFeeCorrection; eligibilityDraft?: PreparedEligibility; eligibilityIssue?: EligibilityReviewIssue; workingDraft?: CatalogWorkingDraft;
}) {
  const router = useRouter();
  const [content, setContent] = useState(JSON.stringify(workingDraft?.proposed_content ?? (snapshot && entityType ? revisionContent(entityType, snapshot) : {}), null, 2));
  const [draftVersion, setDraftVersion] = useState<number | null>(workingDraft?.version ?? null);
  const [baseSnapshot, setBaseSnapshot] = useState(workingDraft?.base_snapshot ?? snapshot);
  const [reason, setReason] = useState(workingDraft?.reason ?? "");
  async function saveWorkingDraft(action: "SAVE" | "SUBMIT" | "DISCARD") {
    let value: Record<string,unknown>;
    try { value = action === "DISCARD" ? {} : JSON.parse(content); } catch { setMessage("Content JSON is invalid. Repair it before saving."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/catalog-drafts", { method: action === "SAVE" ? "PUT" : action === "SUBMIT" ? "POST" : "DELETE", headers: { "Content-Type":"application/json" }, body: JSON.stringify({entityType,entityId,baseSnapshot,content:normalizeEditorialContent(value),reason,version:draftVersion}) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Could not save your draft.");
      if (action === "SAVE") { setDraftVersion(result.draft.version); setMessage("Working draft saved privately. You can return to this record to continue; it has not been submitted for review."); }
      else {
        setDraftVersion(null); setBaseSnapshot(snapshot); setReason("");
        setContent(JSON.stringify(snapshot && entityType ? revisionContent(entityType,snapshot) : {},null,2));
        setMessage(action === "SUBMIT" ? "Draft submitted for administrator review. Catalog unchanged." : "Saved draft discarded. The form now shows the catalog snapshot from this page; reload if the catalog changed again.");
      }
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connection failed. Your text is retained."); }
    finally { setBusy(false); }
  }
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function request(url: string, method: string, body: unknown) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error([result.error || "Request failed.", ...(result.issues || []).slice(0, 5).map((issue: {entityId:string;field:string;message:string}) => `${issue.entityId} · ${issue.field}: ${issue.message}`)].join(" "));
      setMessage(url.endsWith("/rollback") ? "Rollback proposal prepared. Review the before/proposed changes, then apply it to restore earlier content." : method === "POST" ? "Revision submitted for administrator review. Catalog unchanged." : "Review saved. Changes to published records are available on the next page load.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connection failed. Please retry."); }
    finally { setBusy(false); }
  }
  return <div className="catalog-revisions">
    <p className="admin-notice">Proposals stay private until an administrator applies them. Applying a revision to a published record updates public pages; applying to a draft keeps it private. Review all affected fees and content before applying.</p>
    {eligibilityIssue ? <EligibilityReviewNotice issue={eligibilityIssue}/> : null}
    {snapshot && entityType && entityId && role !== "VIEWER" ? <section className="card admin-detail-card">
      <h2>{draftVersion ? "Continue your working draft" : "Propose a content revision"}</h2>
      {draftVersion ? <p className="admin-notice">Your private saved draft is loaded. Saving does not submit it for review. If the catalog has changed, submission will stop so you can compare it with the current record below.</p> : null}
      <p>Edit the labelled fields below, explain the changes and include supporting official links. This submits a separate proposal; the current catalog record stays unchanged.</p>
      <form className="admin-form-grid" action={async form => {
        if (form.get("intent") === "SAVE") { await saveWorkingDraft("SAVE"); return; }
        if (draftVersion !== null) { await saveWorkingDraft("SUBMIT"); return; }
        let value: unknown;
        try { value = JSON.parse(content); } catch { setMessage("Content JSON is invalid."); return; }
        await request("/api/admin/catalog-revisions", "POST", { entityType, entityId, baseSnapshot, content: normalizeEditorialContent(value as Record<string,unknown>), reason: String(form.get("reason") || "") });
      }}>
        <CatalogContentEditor eligibilityDraft={eligibilityDraft} feeCorrection={feeCorrection} curriculumDraft={curriculumDraft} entityType={entityType} value={content} onChange={setContent} disabled={busy}/>
        <div className="field admin-span-2"><label htmlFor="revision-reason">What changed and why?</label><textarea id="revision-reason" name="reason" minLength={5} maxLength={2000} required disabled={busy} value={reason} onChange={event=>setReason(event.target.value)} /></div>
        <button className="btn ghost" name="intent" value="SAVE" formNoValidate disabled={busy}>Save working draft</button>
        <button className="btn primary" name="intent" value="SUBMIT" disabled={busy}>Submit for review</button>
      </form>
      {draftVersion ? <details><summary>Compare or discard your working draft</summary>
        <p>The current catalog snapshot is below. Copy any draft text you need before discarding; discarding removes your saved draft and resets this form.</p>
        <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(snapshot && entityType ? revisionContent(entityType,snapshot) : {},null,2)}</pre>
        <button type="button" className="btn ghost" disabled={busy} onClick={()=>saveWorkingDraft("DISCARD")}>Discard my working draft</button>
      </details> : null}
    </section> : null}
    <p role="status" aria-live="polite">{message}</p>
    <h2>Recent revisions</h2>
    <p>Showing up to 50 most recent proposals{entityId ? " for this record" : " across the catalog"}.</p>
    {!revisions.length ? <p>No revisions yet.</p> : null}
    {revisions.map(revision=><section className="card admin-detail-card" key={revision.id} id={`revision-${revision.id}`}>
      <h3>{revision.entity_id} · {revision.status.replaceAll("_", " ")}</h3>
      <p>{revision.reason}</p>
      {revision.rollback_of ? <p>Rollback proposal for revision <code>{revision.rollback_of}</code>. The original revision remains in history.</p> : null}
      <p><time dateTime={revision.created_at}>{new Date(revision.created_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST</time></p>
      <Link className="text-link" href={`/admin/catalog-revisions?type=${revision.entity_type}&id=${encodeURIComponent(revision.entity_id)}`}>Open record revisions</Link>
      <details><summary>Review proposed content changes</summary>
        {editorialChanges(revision.base_snapshot,revision.proposed_content).map(change=><div key={change.key}>
          <h4>{change.label}</h4>
          <div className="revision-diff"><div><strong>Before</strong><pre>{editorialDisplay(change.before)}</pre></div><div><strong>Proposed</strong><pre>{editorialDisplay(change.after)}</pre></div></div>
        </div>)}
      </details>
      {revision.review_note ? <p>Review note: {revision.review_note}</p> : null}
      {role === "ADMIN" && revision.status === "APPLIED" ? <details>
        <summary>Restore earlier content</summary>
        <p>Prepare a separate proposal using the content from before this revision. It can replace later content changes too, so review the full comparison before applying. Publication status stays unchanged.</p>
        <form className="admin-form-grid" action={async form => request(`/api/admin/catalog-revisions/${revision.id}/rollback`, "POST", {note:form.get("note")})}>
          <div className="field admin-span-2"><label htmlFor={`rollback-${revision.id}`}>Why restore earlier content?</label><textarea id={`rollback-${revision.id}`} name="note" minLength={5} maxLength={1500} required disabled={busy}/></div>
          <button className="btn ghost" disabled={busy}>Prepare rollback proposal</button>
        </form>
      </details> : null}
      {role === "ADMIN" && revision.status === "NEEDS_REVIEW" ? <form className="admin-form-grid" action={async form=>request(`/api/admin/catalog-revisions/${revision.id}`,"PATCH",{action:form.get("action"),note:form.get("note")})}>
        <div className="field admin-span-2"><label htmlFor={`note-${revision.id}`}>Administrator review note</label><textarea id={`note-${revision.id}`} name="note" minLength={5} maxLength={2000} required disabled={busy}/></div>
        <button className="btn primary" name="action" value="APPLY" disabled={busy}>Apply reviewed revision</button>
        <button className="btn ghost" name="action" value="REJECT" disabled={busy}>Reject revision</button>
      </form> : null}
    </section>)}
  </div>;
}
