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

const indiaTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

// Administrator review of a submitted revision: publish now, schedule (Wave 5 C2) or send back,
// always with a note. The schedule is entered and shown in India time (IST, UTC+05:30).
export function ArticleReviewActions({ revisionId, scheduledFor, scheduleError }: { revisionId: string; scheduledFor?: string | null; scheduleError?: string | null }) {
  const id = useId();
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const { busy, error, run } = useAction();
  const url = `/api/admin/article-revisions/${revisionId}`;
  const noted = note.trim().length >= 5;
  return <div className="article-review-actions">
    {scheduledFor ? <p className="article-schedule-state" role="status"><span>Scheduled to go live on <strong>{indiaTime(scheduledFor)}</strong> (India time).</span> <button type="button" className="btn ghost" disabled={busy} onClick={() => void run(() => call(url, "PATCH", { action: "UNSCHEDULE" }))}>Cancel schedule</button></p> : null}
    {scheduleError ? <p className="admin-error" role="alert">Scheduled publication was refused: {scheduleError}</p> : null}
    <div className="field"><label htmlFor={`${id}-note`}>Review note</label><textarea id={`${id}-note`} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="What you checked, or what needs changing" /></div>
    <div className="article-editor-actions">
      <button type="button" className="btn primary" disabled={busy || !noted} onClick={() => void run(() => call(url, "PATCH", { action: "APPLY", note }))}>Publish now</button>
      <button type="button" className="btn ghost" disabled={busy || !noted} onClick={() => void run(() => call(url, "PATCH", { action: "REJECT", note }))}>Send back</button>
    </div>
    <fieldset className="article-schedule">
      <legend>Or publish later (India time)</legend>
      <div className="field"><label htmlFor={`${id}-date`}>Date</label><input id={`${id}-date`} type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
      <div className="field"><label htmlFor={`${id}-time`}>Time</label><input id={`${id}-time`} type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
      <button type="button" className="btn ghost" disabled={busy || !noted || !date || !time} onClick={() => void run(() => call(url, "PATCH", { action: "SCHEDULE", note, publishAt: `${date}T${time}:00+05:30` }))}>{scheduledFor ? "Change schedule" : "Schedule"}</button>
    </fieldset>
    {error ? <p role="alert" className="admin-error">{error}</p> : null}
  </div>;
}

export function RestoreRevisionButton({ revisionId, replacesDraft }: { revisionId: string; replacesDraft: boolean }) {
  const { busy, error, run } = useAction();
  return <>
    <button type="button" className="btn ghost" disabled={busy} onClick={() => { if (!replacesDraft || window.confirm("Replace your open draft with this version?")) void run(() => call(`/api/admin/article-revisions/${revisionId}/restore`, "POST")); }}>Restore as my draft</button>
    {error ? <span role="alert" className="admin-error">{error}</span> : null}
  </>;
}

export function ArticleStatusButton({ articleId, status }: { articleId: string; status: "PUBLISHED" | "ARCHIVED" }) {
  const { busy, error, run } = useAction();
  const next = status === "PUBLISHED" ? "ARCHIVED" : "PUBLISHED";
  return <>
    <button type="button" className="btn ghost" disabled={busy} onClick={() => { if (window.confirm(next === "ARCHIVED" ? "Unpublish this article? Its page will return 404 until it is republished." : "Republish this article?")) void run(() => call(`/api/admin/articles/${articleId}`, "PATCH", { status: next })); }}>{next === "ARCHIVED" ? "Unpublish" : "Republish"}</button>
    {error ? <span role="alert" className="admin-error">{error}</span> : null}
  </>;
}
