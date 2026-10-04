import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Link from "next/link";
import { generateProgrammaticSeoCandidates } from "@/lib/programmatic-seo";

export const metadata: Metadata = { title: "Programmatic SEO", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";
type Params = Record<string, string | string[] | undefined>;
const first = (value: Params[string]) => (Array.isArray(value) ? value[0] : value) || "";
const PAGE_SIZE = 20;
export default async function ProgrammaticSeoPage({ searchParams }: { searchParams: Promise<Params> }) {
  const catalog = await getPublishedCatalog();
  const candidates = generateProgrammaticSeoCandidates(catalog);
  const live = candidates.filter(candidate => candidate.routeType === "LIVE");
  const future = candidates.filter(candidate => candidate.routeType === "CANDIDATE");
  const intents = [...new Set(candidates.map(candidate => candidate.intent))];
  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 200);
  const intent = intents.find(value => value === first(params.intent)) || "";
  const type = ["LIVE", "CANDIDATE"].includes(first(params.type)) ? first(params.type) : "";
  const filtered = candidates.filter(candidate => (!q || `${candidate.title} ${candidate.slug}`.toLowerCase().includes(q.toLowerCase())) && (!intent || candidate.intent === intent) && (!type || candidate.routeType === type));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const requested = Number(first(params.page));
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, pages) : 1;
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = Boolean(q || intent || type);
  function pageHref(target: number) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (intent) next.set("intent", intent);
    if (type) next.set("type", type);
    next.set("page", String(target));
    return `/admin/programmatic-seo?${next}`;
  }
  return <section className="admin-shell content-quality seo-route-review"><div className="container">
    <div className="admin-page-head"><div><span className="eyebrow">SEO planning</span><h1>Programmatic SEO routes</h1><p>Browse existing routes and proposed topics. This screen lists routes; it does not create pages or submit them to search engines.</p></div></div>
    <div className="admin-grid">
      <article className="card admin-tile"><span className="admin-tag">Existing routes</span><h2>{live.length} live</h2><p>Reported by the current catalog route generator.</p></article>
      <article className="card admin-tile"><span className="admin-tag">Proposed topics</span><h2>{future.length} candidates</h2><p>Planning entries requiring content and an implemented route.</p></article>
      <article className="card admin-tile"><span className="admin-tag">Review required</span><h2>Check before indexing</h2><p>A generator flag does not verify content accuracy, actual robots/canonical settings or search-engine indexing.</p><Link className="text-link" href="/admin/content-quality">Open content checks</Link></article>
    </div>
    <form className="card quality-filters" action="/admin/programmatic-seo" method="get" role="search" aria-label="Filter SEO routes">
      <div><label htmlFor="seo-query">Title or URL path</label><input id="seo-query" name="q" type="search" defaultValue={q} maxLength={200} /></div>
      <div><label htmlFor="seo-intent">Search intent</label><select id="seo-intent" name="intent" defaultValue={intent}><option value="">All intents</option>{intents.map(value => <option key={value} value={value}>{value.toLowerCase()}</option>)}</select></div>
      <div><label htmlFor="seo-type">Route type</label><select id="seo-type" name="type" defaultValue={type}><option value="">All routes</option><option value="LIVE">Live routes</option><option value="CANDIDATE">Candidate topics</option></select></div>
      <div className="quality-filter-actions"><button className="btn primary" type="submit">Filter routes</button>{hasFilters && <Link className="text-link" href="/admin/programmatic-seo">Clear filters</Link>}</div>
    </form>
    <p role="status">{filtered.length ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} matching routes` : "No matching routes"}. Summary counts cover all routes.</p>
    <div className="quality-records">{visible.map(candidate => <article className="card quality-record" key={candidate.slug}>
      <div><span className="admin-tag">{candidate.intent}</span><h2>{candidate.title}</h2><p className="admin-muted">{candidate.slug}</p></div>
      <dl><div><dt>Route type</dt><dd>{candidate.routeType === "LIVE" ? "Live" : "Candidate topic"}</dd></div><div><dt>Generator indexing flag</dt><dd>{candidate.indexable ? "Allowed by generator" : "On hold"}</dd></div></dl>
      <p>{candidate.routeType === "LIVE" ? "An existing route is reported. Verify its current content, metadata and source evidence before promoting it." : candidate.reason}</p>
      <details><summary>Related catalog pages ({candidate.sourceUrls.length})</summary><ul>{candidate.sourceUrls.map(source => <li key={source}><Link href={source} prefetch={false}>{source}</Link></li>)}</ul><p className="admin-muted">These internal references are not official university or regulator evidence.</p></details>
      {candidate.routeType === "LIVE" && <Link className="btn secondary" href={candidate.slug} prefetch={false} aria-label={`Open route: ${candidate.title}`}>Open route</Link>}
    </article>)}</div>
    {!visible.length && <section className="card quality-empty"><h2>{hasFilters ? "No matching routes" : "No routes available"}</h2><p>{hasFilters ? "Try another search intent, route type or search term." : "Routes appear when catalog content is available."}</p>{hasFilters && <Link className="btn secondary" href="/admin/programmatic-seo">View all routes</Link>}</section>}
    {pages > 1 && <nav className="source-import-pagination" aria-label="SEO route pages">{page > 1 && <Link className="btn ghost" href={pageHref(page - 1)}>Previous page</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link className="btn ghost" href={pageHref(page + 1)}>Next page</Link>}</nav>}
  </div></section>;
}
