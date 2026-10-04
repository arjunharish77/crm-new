import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { loadCatalogSnapshot } from "@/lib/catalog-snapshot-server";
import { catalogReader } from "@/lib/catalog-snapshot";
import { formatFee } from "@/lib/catalog-format";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "CMS catalog preview", robots: { index: false, follow: false, nocache: true } };
type Params = Record<string, string | string[] | undefined>;
const first = (value: Params[string]) => (Array.isArray(value) ? value[0] : value) || "";
const PAGE_SIZE = 12;
export default async function CatalogPreviewPage({ searchParams }: { searchParams: Promise<Params> }) {
  if (!await getAdminSession()) redirect("/admin/login");
  const result = await loadCatalogSnapshot();
  const reader = result.snapshot ? catalogReader(result.snapshot) : null;
  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 200);
  const university = reader?.universities.find(item => item.id === first(params.university))?.id || "";
  const filtered = reader?.courses.filter(course => (!university || course.universityId === university) && (!q || `${course.name} ${course.id}`.toLowerCase().includes(q.toLowerCase()))) || [];
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const requested = Number(first(params.page));
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, pages) : 1;
  function pageHref(target: number) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (university) next.set("university", university);
    next.set("page", String(target));
    return `/admin/catalog-preview?${next}`;
  }
  return <section className="admin-shell content-quality catalog-preview"><div className="container">
    <div className="admin-page-head"><div><span className="eyebrow">Published catalog</span><h1>CMS catalog readiness</h1><p>This reads the published CMS records used by public pages, tools and lead dropdowns. Unsaved edits and proposed revisions are not included.</p></div><Link className="btn ghost" href="/admin/content-quality">Open content checks</Link></div>
    <p>These checks validate data structure and relationships. They do not verify university claims, fees or source freshness. Ratings and outcome claims remain pending verification.</p>
    {!reader ? <section className="card admin-detail-card"><h2>{result.issues.length} issues block the CMS snapshot</h2><p>Fix the records below through the review workflow. No partial snapshot or static fallback is used.</p>
      <div className="quality-records">{result.issues.map((issue, index) => <article className="card quality-record" key={index}><h3>{issue.entityId}</h3><p><strong>Field:</strong> {issue.field}</p><p>{issue.message}</p>{issue.entityType !== "catalog" && <Link className="btn secondary" href={`/admin/catalog-revisions?type=${issue.entityType}&id=${encodeURIComponent(issue.entityId)}`}>Review record</Link>}</article>)}</div>
    </section> : <>
      <p role="status">Structurally ready: {reader.universities.length} universities and {reader.courses.length} courses. Official-source verification is separate and remains in progress.</p>
      <h2>Published CMS courses</h2>
      <form className="card quality-filters" action="/admin/catalog-preview" method="get" role="search" aria-label="Filter published courses">
        <div><label htmlFor="preview-query">Course name or ID</label><input id="preview-query" name="q" type="search" defaultValue={q} maxLength={200} /></div>
        <div><label htmlFor="preview-university">University</label><select id="preview-university" name="university" defaultValue={university}><option value="">All universities</option>{reader.universities.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div className="quality-filter-actions"><button className="btn primary" type="submit">Filter courses</button>{(q || university) && <Link className="text-link" href="/admin/catalog-preview">Clear filters</Link>}</div>
      </form>
      <p>Showing {filtered.length ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)}` : "0"} of {filtered.length} matching courses. University summaries below are not filtered.</p>
      <div className="quality-records">{filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(course => {
        const enriched = reader.courseWithUniversity(course);
        return <article className="card quality-record preview-course" key={course.id}>
          <div><span className="admin-tag">{enriched.university.name}</span><h3>{course.name}</h3><p className="admin-muted">{course.id}</p></div>
          <dl><div><dt>Recorded tuition</dt><dd>{formatFee(course.fee)}</dd></div><div><dt>Duration</dt><dd>{course.duration}</dd></div></dl>
          <details><summary>Published eligibility text</summary><p>{course.eligibility}</p><p className="admin-muted">Published text is shown as stored; source confirmation is a separate review.</p></details>
          <div className="quality-record-actions"><Link className="btn secondary" href={`/admin/catalog-revisions?type=course&id=${encodeURIComponent(course.id)}`} aria-label={`Review course: ${course.id}`}>Review content</Link><Link className="text-link" href={`/courses/${course.slug}`} prefetch={false}>Open public page</Link></div>
        </article>;
      })}</div>
      {!filtered.length && <section className="card quality-empty"><h3>No matching published courses</h3><p>Try another course name or university.</p><Link className="btn secondary" href="/admin/catalog-preview">View all published courses</Link></section>}
      {pages > 1 && <nav className="source-import-pagination" aria-label="Published course pages">{page > 1 && <Link className="btn ghost" href={pageHref(page - 1)}>Previous page</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link className="btn ghost" href={pageHref(page + 1)}>Next page</Link>}</nav>}
      <h2 style={{ marginTop: 28 }}>Published CMS universities</h2>
      <div className="quality-records">{reader.universities.map(item => <article className="card quality-record preview-university" key={item.id}><h3>{item.name}</h3><p>{item.city}</p><details><summary>Published overview</summary><p>{item.about}</p></details><div className="quality-record-actions"><Link className="btn secondary" href={`/admin/catalog-revisions?type=university&id=${encodeURIComponent(item.id)}`} aria-label={`Review university: ${item.id}`}>Review content</Link><Link className="text-link" href={`/universities/${item.slug}`} prefetch={false}>Open public page</Link></div></article>)}</div>
    </>}
  </div></section>;
}
