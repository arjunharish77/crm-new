import type { Metadata } from "next";
import Link from "next/link";
import { query } from "@/lib/db";

export const metadata: Metadata = { title: "CRM Sync History", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";
const STATUSES = ["QUEUED", "PROCESSING", "SUCCESS", "FAILED", "SKIPPED", "DUPLICATE"];
const TRIGGERS = ["MANUAL", "BULK_MANUAL", "AUTO", "RETRY"];
const PAGE_SIZE = 20;
type Params = Record<string, string | string[] | undefined>;
const first = (value: Params[string]) => (Array.isArray(value) ? value[0] : value) || "";
type Attempt = { id: string; lead_capture_id: string; trigger_type: string; status: string; response_status: number | null; crm_record_id: string | null; error_message: string | null; created_at: string; completed_at: string | null };
const displayDate = (value: string | null) => value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Not recorded";
function outcome(attempt: Attempt) {
  if (attempt.error_message) return attempt.error_message;
  switch (attempt.status) {
    case "SUCCESS": return "Delivery recorded as successful.";
    case "QUEUED": return "Waiting for the delivery worker.";
    case "PROCESSING": return "Delivery attempt in progress.";
    case "FAILED": return "Delivery failed; no error detail recorded.";
    case "SKIPPED": return "Attempt skipped; no reason recorded.";
    case "DUPLICATE": return "Attempt marked as duplicate; no further detail recorded.";
    default: return "No outcome detail recorded.";
  }
}
export default async function CrmSyncHistoryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 200);
  const status = STATUSES.includes(first(params.status)) ? first(params.status) : "";
  const trigger = TRIGGERS.includes(first(params.trigger)) ? first(params.trigger) : "";
  const where = `($1 = '' or id::text ilike $2 or lead_capture_id::text ilike $2 or crm_record_id ilike $2) and ($3 = '' or status = $3) and ($4 = '' or trigger_type = $4)`;
  const values = [q, `%${q.replace(/[\\%_]/g, "\\$&")}%`, status, trigger];
  const total = (await query<{ total: number }>(`select count(*)::int as total from crm_sync_attempt where ${where}`, values)).rows[0].total;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number(first(params.page));
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, pages) : 1;
  const attempts = await query<Attempt>(`select id, lead_capture_id, trigger_type, status, response_status, crm_record_id, error_message, created_at, completed_at from crm_sync_attempt where ${where} order by created_at desc, id desc limit $5 offset $6`, [...values, PAGE_SIZE, (page - 1) * PAGE_SIZE]);
  const hasFilters = Boolean(q || status || trigger);
  function pageHref(target: number) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (status) next.set("status", status);
    if (trigger) next.set("trigger", trigger);
    next.set("page", String(target));
    return `/admin/crm-sync/history?${next}`;
  }
  return <section className="admin-shell content-quality crm-history"><div className="container">
    <div className="admin-page-head"><div><span className="eyebrow">Delivery audit</span><h1>CRM sync history</h1><p>Review individual delivery attempts. A queued attempt is not confirmed delivery. All timestamps use India time.</p></div><Link className="btn ghost" href="/admin/crm-sync">Back to CRM settings</Link></div>
    <form className="card quality-filters" action="/admin/crm-sync/history" method="get" role="search" aria-label="Filter delivery attempts">
      <div><label htmlFor="attempt-query">Attempt, lead or CRM record ID</label><input id="attempt-query" name="q" type="search" defaultValue={q} maxLength={200} /></div>
      <div><label htmlFor="attempt-status">Delivery status</label><select id="attempt-status" name="status" defaultValue={status}><option value="">All statuses</option>{STATUSES.map(value => <option key={value} value={value}>{value.charAt(0) + value.slice(1).toLowerCase()}</option>)}</select></div>
      <div><label htmlFor="attempt-trigger">Trigger</label><select id="attempt-trigger" name="trigger" defaultValue={trigger}><option value="">All triggers</option>{TRIGGERS.map(value => <option key={value} value={value}>{value.replaceAll("_", " ").toLowerCase()}</option>)}</select></div>
      <div className="quality-filter-actions"><button className="btn primary" type="submit">Filter attempts</button>{hasFilters && <Link className="text-link" href="/admin/crm-sync/history">Clear filters</Link>}</div>
    </form>
    <p role="status">{total ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total} attempts` : "No matching attempts"}</p>
    <div className="quality-records">{attempts.rows.map(attempt => <article className="card quality-record" key={attempt.id}>
      <div><span className={attempt.status === "SUCCESS" ? "admin-status good" : "admin-status"}>{attempt.status}</span><h2>{attempt.trigger_type.replaceAll("_", " ")} delivery attempt</h2><p className="admin-muted">{attempt.id}</p></div>
      <dl><div><dt>HTTP response</dt><dd>{attempt.response_status ?? "Not recorded"}</dd></div><div><dt>CRM record</dt><dd>{attempt.crm_record_id || "Not recorded"}</dd></div><div><dt>Created</dt><dd>{displayDate(attempt.created_at)}</dd></div><div><dt>Completed</dt><dd>{displayDate(attempt.completed_at)}</dd></div></dl>
      <details><summary>Delivery outcome</summary><p>{outcome(attempt)}</p></details>
      <Link className="btn secondary" href={`/admin/leads/${attempt.lead_capture_id}`} aria-label={`View lead for attempt ${attempt.id}`}>View lead</Link>
    </article>)}</div>
    {!attempts.rows.length && <section className="card quality-empty"><h2>{hasFilters ? "No matching delivery attempts" : "No delivery attempts yet"}</h2><p>{hasFilters ? "Try another record ID, status or trigger." : "Attempts appear here when CRM delivery is queued."}</p>{hasFilters && <Link className="btn secondary" href="/admin/crm-sync/history">View all attempts</Link>}</section>}
    {pages > 1 && <nav className="source-import-pagination" aria-label="Delivery history pages">{page > 1 && <Link className="btn ghost" href={pageHref(page - 1)}>Previous page</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link className="btn ghost" href={pageHref(page + 1)}>Next page</Link>}</nav>}
  </div></section>;
}
