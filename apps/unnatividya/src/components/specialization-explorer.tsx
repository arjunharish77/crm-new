"use client";

import Image from "next/image";
import Link from "next/link";
import { useLiveSearchParams, useUrlSearchText, writeUrl } from "@/lib/use-live-search-params";
import { ArrowRight, BriefcaseBusiness, Search, Shapes } from "lucide-react";
import { STREAM_ICONS } from "@/components/course-card";
import { universityMedia } from "@/data/media";
import { formatFee } from "@/lib/catalog-format";
import type { SpecializationPage } from "@/lib/specializations";

function listNames(names: string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join("");
}

type ExplorerPage = SpecializationPage & { stream: string };

// Specializations explorer (design Specializations.dc.html; spec C §3): search box and degree
// pills from the design (in the hero), plus the existing subject filter. All state lives in the URL
// (q, stream, degree), so the filters and the results are two islands reading the same state,
// filtered views can be shared and the back button works.
function useSpecializationFilters(pages: ExplorerPage[]) {
  const params = useLiveSearchParams();
  const query = (params.get("q") || "").slice(0, 200);
  const streams = [...new Set(pages.map(page => page.stream))].sort();
  const degrees = [...new Set(pages.map(page => page.courseLabel))].sort();
  const stream = streams.includes(params.get("stream") || "") ? params.get("stream")! : "";
  const degree = degrees.includes(params.get("degree") || "") ? params.get("degree")! : "";
  const text = query.trim().toLowerCase();
  const filtered = pages.filter(page => (!stream || page.stream === stream) && (!degree || page.courseLabel === degree) && (!text || `${page.specialization} ${page.courseLabel} ${page.courses.map(course => course.university.name).join(" ")}`.toLowerCase().includes(text)));
  const grouped = degrees.map(value => [value, filtered.filter(page => page.courseLabel === value)] as const).filter(([, group]) => group.length);
  function update(key: string, value: string, replace = false) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
    writeUrl(url, replace);
  }
  function reset() {
    const url = new URL(window.location.href);
    ["q", "stream", "degree"].forEach(key => url.searchParams.delete(key));
    writeUrl(url);
  }

  return { query, streams, degrees, stream, degree, filtered, grouped, update, reset };
}

export function SpecializationFilters({ pages }: { pages: ExplorerPage[] }) {
  const { query, streams, degrees, stream, degree, update } = useSpecializationFilters(pages);
  const [text, setText] = useUrlSearchText(query, value => update("q", value, true));
  return <div className="uvs-filters" role="search" aria-label="Search and filter specializations">
    <div className="uvs-controls">
      <div className="uvs-search">
        <Search size={22} aria-hidden="true" />
        <label htmlFor="specialization-query" className="sr-only">Search specializations</label>
        <input id="specialization-query" type="search" maxLength={200} value={text} onChange={event => setText(event.target.value)} placeholder="Search Finance, Data Science, Marketing…" />
      </div>
      <div className="uvs-select">
        <label htmlFor="specialization-stream">Subject area</label>
        <select id="specialization-stream" value={stream} onChange={event => update("stream", event.target.value)}>
          <option value="">All subjects</option>
          {streams.map(value => <option key={value}>{value}</option>)}
        </select>
      </div>
    </div>
    <div className="uvs-pills" role="group" aria-label="Filter by degree">
      <button type="button" aria-pressed={!degree} onClick={() => update("degree", "")}>All</button>
      {degrees.map(value => <button type="button" key={value} aria-pressed={degree === value} onClick={() => update("degree", value)}>{value}</button>)}
    </div>
  </div>;
}

export function SpecializationResults({ pages }: { pages: ExplorerPage[] }) {
  const { query, stream, degree, filtered, grouped, reset } = useSpecializationFilters(pages);
  return <section className="specialization-explorer" aria-label="Specializations">
    <div className="uvs-toolbar">
      <p role="status">{filtered.length} of {pages.length} specializations</p>
      {(query || stream || degree) && <button type="button" className="btn secondary" onClick={reset}>Reset search and filters</button>}
    </div>

    {grouped.length ? <div className="uvs-groups">
      {grouped.map(([label, group]) => {
        const Icon = STREAM_ICONS[group[0].stream] || BriefcaseBusiness;
        return <section className="uvs-group" key={label} aria-labelledby={`spec-group-${group[0].courseKeyPart}`}>
          <div className="uvs-group-head">
            <span className="uv-icon-tile" aria-hidden="true"><Icon size={22} /></span>
            <h2 id={`spec-group-${group[0].courseKeyPart}`}>{label}</h2>
            <p>{group.length} specialization{group.length === 1 ? "" : "s"}</p>
          </div>
          <ul className="uvs-grid">
            {group.map(page => {
              const universities = [...new Map(page.courses.map(course => [course.university.id, course.university])).values()];
              return <li key={page.slug}>
                <Link href={`/specializations/${page.slug}`} className="uvs-card specialization-card">
                  <div className="uvs-card-top">
                    <h3>{page.specialization}</h3>
                    <ArrowRight size={20} aria-hidden="true" />
                  </div>
                  <span className="sr-only">{page.courseLabel}. Offered by {listNames(universities.map(university => university.name))}.</span>
                  <div className="uvs-card-foot">
                    <span className="uvs-logos" aria-hidden="true">
                      {universities.map(university => universityMedia[university.id] ? <Image key={university.id} src={universityMedia[university.id].logo} alt="" width={26} height={26} /> : null)}
                    </span>
                    <span className="uvs-fee">
                      <span>Degree tuition</span>
                      <span>from <b>{formatFee(Math.min(...page.courses.map(course => course.fee)))}</b></span>
                    </span>
                  </div>
                  <span className="uvs-card-cta">{page.isComparison ? "Explore university options" : "View specialization"}</span>
                </Link>
              </li>;
            })}
          </ul>
        </section>;
      })}
    </div> : <div className="uv-empty uvs-empty">
      <div className="uv-empty-art" aria-hidden="true"><span><Shapes size={28} /></span><i /><i /></div>
      <h2>{query.trim() ? `No specializations match “${query.trim()}”` : "No specializations match these filters"}</h2>
      <p>Try a broader term like Finance, Data or Marketing.</p>
      <div className="uv-empty-actions">
        <button type="button" className="btn primary" onClick={reset}>Show all specializations</button>
        <Link href="/courses" className="btn secondary">Browse all courses</Link>
      </div>
    </div>}
  </section>;
}
