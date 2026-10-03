"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatFee } from "@/lib/catalog-format";
import type { SpecializationPage } from "@/lib/specializations";

export function SpecializationExplorer({ pages }: { pages: Array<SpecializationPage & { stream: string }> }) {
  const params = useSearchParams();
  const query = (params.get("q") || "").slice(0, 200);
  const streams = [...new Set(pages.map(page => page.stream))].sort();
  const degrees = [...new Set(pages.map(page => page.courseLabel))].sort();
  const stream = streams.includes(params.get("stream") || "") ? params.get("stream")! : "";
  const degree = degrees.includes(params.get("degree") || "") ? params.get("degree")! : "";
  const text = query.trim().toLowerCase();
  const filtered = pages.filter(page => (!stream || page.stream === stream) && (!degree || page.courseLabel === degree) && (!text || `${page.specialization} ${page.courseLabel} ${page.courses.map(course => course.university.name).join(" ")}`.toLowerCase().includes(text)));
  const grouped = streams.map(value => [value, filtered.filter(page => page.stream === value)] as const).filter(([,group]) => group.length);
  function update(key: string, value: string, replace = false) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key,value); else url.searchParams.delete(key);
    if (replace) window.history.replaceState(null,"",url); else window.history.pushState(null,"",url);
  }
  function reset() {
    const url = new URL(window.location.href);
    ["q","stream","degree"].forEach(key => url.searchParams.delete(key));
    window.history.pushState(null,"",url);
  }

  return <section className="specialization-explorer" aria-label="Explore specializations">
    <div className="specialization-filters">
      <div><label htmlFor="specialization-query">Search specializations</label><input id="specialization-query" type="search" maxLength={200} value={query} onChange={event => update("q",event.target.value,true)} placeholder="Subject, degree or university" /></div>
      <div><label htmlFor="specialization-stream">Subject area</label><select id="specialization-stream" value={stream} onChange={event => update("stream",event.target.value)}><option value="">All subjects</option>{streams.map(value => <option key={value}>{value}</option>)}</select></div>
      <div><label htmlFor="specialization-degree">Degree</label><select id="specialization-degree" value={degree} onChange={event => update("degree",event.target.value)}><option value="">All degrees</option>{degrees.map(value => <option key={value}>{value}</option>)}</select></div>
    </div>
    <div className="specialization-toolbar"><p role="status">{filtered.length} of {pages.length} specializations</p>{(query || stream || degree) && <button type="button" className="btn secondary" onClick={reset}>Reset search and filters</button>}</div>
    {grouped.length ? grouped.map(([subject,group]) => <section className="specialization-group" key={subject} aria-label={subject}>
      <h2>{subject}</h2>
      <div className="specialization-grid">{group.map(page => <Link href={`/specializations/${page.slug}`} className="specialization-card" key={page.slug}>
        <h3>{page.specialization}</h3><p>{page.courseLabel} · {new Set(page.courses.map(course => course.university.id)).size} {page.isComparison ? "universities" : "university"}</p>
        <p>Listed degree tuition from <strong>{formatFee(Math.min(...page.courses.map(course => course.fee)))}</strong></p>
        <span>{page.isComparison ? "Explore university options" : "View specialization"} →</span>
      </Link>)}</div>
    </section>) : <div className="illustrated-empty-state"><h2>No specializations match</h2><p>Try a broader search or reset the subject and degree filters.</p><Link href="/courses" className="btn secondary">Browse all courses</Link></div>}
  </section>;
}
