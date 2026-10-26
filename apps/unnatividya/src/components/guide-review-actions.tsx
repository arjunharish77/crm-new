"use client";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

async function call(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The request failed.");
  return result;
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(work: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await work(); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : "The request failed."); } finally { setBusy(false); }
  }
  return { busy, error, run };
}

// Wave 5 C3: administrator review of a submitted guide revision, always with a note.
export function GuideReviewActions({ revisionId }: { revisionId: string }) {
  const id = useId();
  const [note, setNote] = useState("");
  const { busy, error, run } = useAction();
  const url = `/api/admin/guide-revisions/${revisionId}`;
  return <div className="article-review-actions">
    <div className="field"><label htmlFor={`${id}-note`}>Review note</label><textarea id={`${id}-note`} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="What you checked against the sources, or what needs changing" /></div>
    <div className="article-editor-actions">
      <button type="button" className="btn primary" disabled={busy || note.trim().length < 5} onClick={() => void run(() => call(url, "PATCH", { action: "APPLY", note }))}>Publish this revision</button>
      <button type="button" className="btn ghost" disabled={busy || note.trim().length < 5} onClick={() => void run(() => call(url, "PATCH", { action: "REJECT", note }))}>Send back</button>
    </div>
    {error ? <p role="alert" className="admin-error">{error}</p> : null}
  </div>;
}

export function RestoreGuideButton({ revisionId, replacesDraft }: { revisionId: string; replacesDraft: boolean }) {
  const { busy, error, run } = useAction();
  return <>
    <button type="button" className="btn ghost" disabled={busy} onClick={() => { if (!replacesDraft || window.confirm("Replace your open draft with this version?")) void run(() => call(`/api/admin/guide-revisions/${revisionId}/restore`, "POST")); }}>Restore as my draft</button>
    {error ? <span role="alert" className="admin-error">{error}</span> : null}
  </>;
}
