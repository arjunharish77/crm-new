import Link from "next/link";

export type QueueParams = Record<string, string | string[] | undefined>;
export type QueueRecord = {
  id: string; name: string; searchText: string; status: string; published: boolean;
  universityId?: string; universityName?: string;
  fields: Array<{ label: string; value: string }>;
};
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] || "" : value || "";
const PAGE_SIZE = 12;

export function CatalogReviewQueue({ type, records, params, canCreate, universities = [] }: {
  type: "course" | "university"; records: QueueRecord[]; params: QueueParams; canCreate: boolean;
  universities?: Array<{ id: string; name: string }>;
}) {
  const label = type === "course" ? "Course" : "University";
  const base = type === "course" ? "/admin/courses" : "/admin/universities";
  const q = first(params.q).trim().slice(0, 200);
  const status = ["DRAFT", "NEEDS_REVIEW", "PUBLISHED", "ARCHIVED"].includes(first(params.status)) ? first(params.status) : "";
  const university = universities.some(item => item.id === first(params.university)) ? first(params.university) : "";
  const filtered = records.filter(record => (!q || record.searchText.toLowerCase().includes(q.toLowerCase())) && (!status || record.status === status) && (!university || record.universityId === university));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const requested = Number(first(params.page));
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, pages) : 1;
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = Boolean(q || status || university);
  function pageHref(target: number) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (status) next.set("status", status);
    if (university) next.set("university", university);
    next.set("page", String(target));
    return `${base}?${next}`;
  }
  return <section className="admin-shell content-quality catalog-review-queue"><div className="container">
    <div className="admin-page-head"><div><span className="eyebrow">CMS</span><h1>{label} review queue</h1><p>Review catalog records and source information. Drafts remain private; use revisions to propose and review changes.</p></div>
      <div className="course-actions"><span className="admin-count">{filtered.length} matching records</span>{canCreate && <Link className="btn primary" href={`${base}/new`}>New {type}</Link>}</div>
    </div>
    <form className="card quality-filters" action={base} method="get" role="search" aria-label={`Filter ${type} records`}>
      <div><label htmlFor="queue-query">Name or record ID</label><input id="queue-query" type="search" name="q" defaultValue={q} maxLength={200} /></div>
      <div><label htmlFor="queue-status">Record status</label><select id="queue-status" name="status" defaultValue={status}><option value="">All statuses</option><option value="DRAFT">Draft</option><option value="NEEDS_REVIEW">Needs review</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select></div>
      {type === "course" && <div><label htmlFor="queue-university">University</label><select id="queue-university" name="university" defaultValue={university}><option value="">All universities</option>{universities.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}
      <div className="quality-filter-actions"><button className="btn primary" type="submit">Filter records</button>{hasFilters && <Link className="text-link" href={base}>Clear filters</Link>}</div>
    </form>
    <p role="status">{filtered.length ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} matching records` : "No matching records"}</p>
    <div className="quality-records">{visible.map(record => <article className="card quality-record" key={record.id}>
      <div>{record.universityName && <span className="admin-tag">{record.universityName}</span>}<h2>{record.name}</h2><p className="admin-muted">{record.id}</p></div>
      <dl>{[...record.fields, { label: "Record status", value: record.status.replaceAll("_", " ") }, { label: "Published flag", value: record.published ? "Yes" : "No" }].map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
      {record.published !== (record.status === "PUBLISHED") && <p>Publication status and flag differ. Review this record before publishing.</p>}
      <div className="quality-record-actions"><Link className="btn secondary" href={`${base}/${encodeURIComponent(record.id)}`} aria-label={`Review record: ${record.name} (${record.id})`}>Review record</Link><Link className="text-link" href={`/admin/catalog-revisions?type=${type}&id=${encodeURIComponent(record.id)}`} aria-label={`View revisions: ${record.name} (${record.id})`}>View revisions</Link></div>
    </article>)}</div>
    {!visible.length && <section className="card quality-empty"><h2>{hasFilters ? "No matching records" : `No ${type === "course" ? "courses" : "universities"} yet`}</h2><p>{hasFilters ? "Try another name or filter." : "New draft records will appear here."}</p>{hasFilters && <Link className="btn secondary" href={base}>View all records</Link>}</section>}
    {pages > 1 && <nav className="source-import-pagination" aria-label={`${label} pages`}>{page > 1 && <Link className="btn ghost" href={pageHref(page - 1)}>Previous page</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link className="btn ghost" href={pageHref(page + 1)}>Next page</Link>}</nav>}
  </div></section>;
}
