import type { Metadata } from "next";
import Link from "next/link";
import { query } from "@/lib/db";

export const metadata: Metadata = { title: "Source Imports", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;
const STATUSES = ["DRAFT", "FETCHING", "FETCHED", "FAILED"];
type ImportRow = { id: string; source_name: string; source_url: string; status: string; fetched_at: string; item_count: number; pending_count: number };
type Search = Record<string, string | string[] | undefined>;
function first(value: Search[string]) { return (Array.isArray(value) ? value[0] : value) || ""; }

export default async function SourceImportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 200);
  const status = STATUSES.includes(first(params.status)) ? first(params.status) : "";
  const requestedPage = /^\d+$/.test(first(params.page)) ? Number(first(params.page)) : 1;
  const pageInput = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const where = `($1 = '' or si.source_name ilike $2 or si.source_url ilike $2 or si.id::text ilike $2) and ($3 = '' or si.status = $3)`;
  const values = [q, pattern, status];
  const count = await query<{ total: number }>(`select count(*)::int as total from source_import si where ${where}`, values);
  const total = count.rows[0].total;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pageInput, pages);
  const imports = await query<ImportRow>(
    `select si.id, si.source_name, si.source_url, si.status, si.fetched_at,
       count(sii.id)::int as item_count,
       count(sii.id) filter (where sii.review_status in ('DRAFT', 'NEEDS_REVIEW'))::int as pending_count
     from source_import si left join source_import_item sii on sii.source_import_id = si.id
     where ${where} group by si.id order by si.fetched_at desc, si.id desc limit $4 offset $5`,
    [...values, PAGE_SIZE, (page - 1) * PAGE_SIZE],
  );
  function pageHref(target: number) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (status) next.set("status", status);
    next.set("page", String(target));
    return `/admin/source-imports?${next}`;
  }
  return <section className="admin-shell source-import-list"><div className="container">
    <div className="admin-page-head"><div><span className="eyebrow">CMS</span><h1>Source imports</h1>
      <p>Find captured source pages and review their evidence. A fetched source is not a verified or published catalog update.</p></div></div>
    <form action="/admin/source-imports" method="get" className="source-import-filters" role="search" aria-label="Find source imports">
      <div><label htmlFor="import-search">Search imports</label><input id="import-search" type="search" name="q" maxLength={200} defaultValue={q} placeholder="Source name, URL or import ID" /></div>
      <div><label htmlFor="import-status">Import status</label><select id="import-status" name="status" defaultValue={status}><option value="">All statuses</option>{STATUSES.map(value => <option key={value} value={value}>{value.charAt(0) + value.slice(1).toLowerCase()}</option>)}</select></div>
      <button className="btn primary" type="submit">Search imports</button>
      {(q || status) && <Link className="text-link" href="/admin/source-imports">Clear filters</Link>}
    </form>
    <p role="status" className="source-import-count">{total ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total} imports` : "No imports found"}</p>
    {imports.rows.length ? <div className="source-import-cards">{imports.rows.map(item => <article key={item.id} className="card admin-detail-card">
      <header className="source-review-item-head"><h2><Link href={`/admin/source-imports/${item.id}`}>{item.source_name}</Link></h2><span className="admin-status">{item.status}</span></header>
      <dl className="source-import-facts">
        <div><dt>Captured items</dt><dd>{item.item_count}</dd></div>
        <div><dt>Awaiting review</dt><dd>{item.pending_count}</dd></div>
        <div><dt>Fetched (India time)</dt><dd>{new Date(item.fetched_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</dd></div>
      </dl>
      <p className="source-import-url">{item.source_url}</p>
      <div className="source-import-links"><Link className="btn primary" href={`/admin/source-imports/${item.id}`} aria-label={`Review import: ${item.source_name}`}>Review import</Link><a className="text-link" href={item.source_url} target="_blank" rel="noreferrer">Open source (new tab)</a></div>
    </article>)}</div> : <section className="card admin-detail-card"><h2>{q || status ? "No matching imports" : "No sources captured yet"}</h2><p>{q || status ? "Try a broader source name or choose another status." : "Captured sources will appear here after a source-import run. Ask the site administrator to run the configured importer."}</p>{(q || status) && <Link href="/admin/source-imports" className="text-link">View all imports</Link>}</section>}
    {total > PAGE_SIZE && <nav aria-label="Import pages" className="source-import-pagination">
      {page > 1 && <Link className="btn ghost" href={pageHref(page - 1)}>Previous page</Link>}
      <span>Page {page} of {pages}</span>
      {page < pages && <Link className="btn ghost" href={pageHref(page + 1)}>Next page</Link>}
    </nav>}
  </div></section>;
}
