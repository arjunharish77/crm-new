"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useLiveSearchParams, useUrlSearchText, writeUrl } from "@/lib/use-live-search-params";
import { Search, SearchX, SlidersHorizontal, X } from "lucide-react";
import { trackEvent } from "@/components/analytics";
import { CourseCard } from "@/components/course-card";
import { formatFee } from "@/lib/catalog-format";
import { type Course, type University } from "@/data/catalog";
import { FeeGroupSwitch, useFeeGroup } from "@/components/fee-group";

type CourseItem = Course & { university: University };
// "relevance" replaced review-count ("most reviewed") and rating sorts: both ranked by unverified
// figures (next-phase plan T4). Older ?sort=popular / ?sort=rating links fall back to relevance.
type SortKey = "relevance" | "feeAsc" | "feeDesc";
type Group = "level" | "degree" | "stream" | "university";

// The design's "Degree" list comes first; any other degree in the catalog sits under "More degrees".
const PRIMARY_DEGREES = ["MBA", "BBA", "BCA", "MCA", "B.Com", "M.Com", "BA"];
const FEE_STEP = 5000;

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

// Writes filter changes to the URL (shareable, back/forward aware). Design aliases (lvl, uni) are
// read on arrival and dropped on the first write, so the canonical names stay level/university.
function updateParams(changes: Record<string, string | string[] | null>, replace = false) {
  const next = new URLSearchParams(window.location.search);
  for (const [alias, name] of [["lvl", "level"], ["uni", "university"]]) {
    next.getAll(alias).forEach((value) => next.append(name, value));
    next.delete(alias);
  }
  for (const [key, value] of Object.entries(changes)) {
    next.delete(key);
    if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
    else if (value !== null && value !== "") next.set(key, value);
  }
  const url = `${window.location.pathname}${next.size ? `?${next}` : ""}${window.location.hash}`;
  if (url !== window.location.pathname + window.location.search + window.location.hash) writeUrl(url, replace);
}

// The hero search box (design Courses hero). A plain GET form, so it also works before
// JavaScript loads; with it, typing filters live through the `q` URL param.
export function CourseSearch() {
  const params = useLiveSearchParams();
  const query = (params.get("q") || "").slice(0, 200);
  const [text, setText] = useUrlSearchText(query, value => updateParams({ q: value }, true));
  // The result count lives in the explorer below; read it from its results region.
  const track = () => { if (query.trim()) trackEvent("course_search", { result_count: Number(document.getElementById("course-results")?.dataset.count ?? 0) }); };
  return <form className="uvc-search" action="/courses" method="get" role="search" aria-label="Courses" onSubmit={(event) => { event.preventDefault(); track(); }}>
    <Search size={22} aria-hidden="true" />
    <label htmlFor="course-search" className="sr-only">Search courses</label>
    <input
      id="course-search"
      name="q"
      type="search"
      value={text}
      maxLength={200}
      autoComplete="off"
      placeholder="Search MBA, Data Science, Finance…"
      onChange={(event) => setText(event.target.value)}
      onBlur={track}
    />
  </form>;
}

export function CourseExplorer({ courses: initialCourses }: { courses: CourseItem[] }) {
  const params = useLiveSearchParams();
  const fees = initialCourses.map((course) => course.fee);
  const feeMin = fees.length ? Math.floor(Math.min(...fees) / FEE_STEP) * FEE_STEP : 0;
  const feeCeiling = Math.max(FEE_STEP, Math.ceil(Math.max(0, ...fees) / FEE_STEP) * FEE_STEP);
  const streamOptions = [...new Set(initialCourses.map((course) => course.stream))].sort();
  const universityOptions = [...new Map(initialCourses.map((course) => [course.universityId, course.university])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const degreeNames = [...new Set(initialCourses.map((course) => course.shortName))];
  const degreeOptions = [
    ...PRIMARY_DEGREES.filter((degree) => degreeNames.includes(degree)),
    ...degreeNames.filter((degree) => !PRIMARY_DEGREES.includes(degree)).sort((a, b) => a.localeCompare(b)),
  ];
  const primaryDegreeCount = PRIMARY_DEGREES.filter((degree) => degreeNames.includes(degree)).length;

  const readRaw = (...keys: string[]) => keys.flatMap((key) => params.getAll(key)).flatMap((value) => value.split(","));
  const readList = (keys: string[], allowed: string[]) => [...new Set(readRaw(...keys).filter((value) => allowed.includes(value)))];
  const query = (params.get("q") || "").slice(0, 200);
  const levels = readList(["level", "lvl"], ["UG", "PG"]);
  const streams = readList(["stream"], streamOptions);
  // Degree links (?degree=MBA) match the course short name, ignoring case.
  const degrees = [...new Set(readRaw("degree").map((value) => degreeOptions.find((degree) => degree.toLowerCase() === value.trim().toLowerCase())).filter((value): value is string => Boolean(value)))];
  // Keep existing short-name links working while writing stable university IDs.
  const universities = [...new Set(readRaw("university", "uni").map((value) => universityOptions.find((university) => university.id === value || university.shortName.toLowerCase() === value.toLowerCase())?.id).filter((value): value is University["id"] => Boolean(value)))];
  const feeParam = Number(params.get("maxFee"));
  const maxFee = params.has("maxFee") && params.get("maxFee") !== "" && Number.isFinite(feeParam) && feeParam >= 0 ? Math.min(Math.floor(feeParam), feeCeiling) : feeCeiling;
  const feeGroup = useFeeGroup();
  const sort: SortKey = ["feeAsc", "feeDesc"].includes(params.get("sort") || "") ? params.get("sort") as SortKey : "relevance";
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filterToggle = useRef<HTMLButtonElement>(null);

  const selected: Record<Group, string[]> = { level: levels, degree: degrees, stream: streams, university: universities };
  const setGroup = (group: Group, values: string[]) => updateParams({ [group]: values });
  const text = query.trim().toLowerCase();

  function matches(course: CourseItem, active: Record<Group, string[]>, activeMaxFee: number) {
    const search = [course.name, course.shortName, course.stream, course.university.name, course.university.shortName, ...course.specializations].join(" ").toLowerCase();
    return (
      (!text || search.includes(text)) &&
      (!active.level.length || active.level.includes(course.level)) &&
      (!active.degree.length || active.degree.includes(course.shortName)) &&
      (!active.stream.length || active.stream.includes(course.stream)) &&
      (!active.university.length || active.university.includes(course.universityId)) &&
      course.fee <= activeMaxFee
    );
  }
  // Live count: what you would get if this were the only option chosen in its group.
  const countMatches = (overrides: Partial<Record<Group, string[]>> = {}, activeMaxFee = maxFee) =>
    initialCourses.filter((course) => matches(course, { ...selected, ...overrides }, activeMaxFee)).length;

  const filtered = initialCourses
    .filter((course) => matches(course, selected, maxFee))
    .sort((a, b) => {
      if (sort === "feeAsc") return a.fee - b.fee;
      if (sort === "feeDesc") return b.fee - a.fee;
      // Relevance: with a search, names that start with it, then names containing it; then the same
      // degree side by side (easy to compare across universities), cheaper first. Never by rating.
      const rank = (name: string) => !text ? 0 : name.toLowerCase().startsWith(text) ? 0 : name.toLowerCase().includes(text) ? 1 : 2;
      return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name) || a.fee - b.fee;
    });

  // Clears filters and the search; the chosen sort stays (design "Clear all").
  function clearFilters() {
    updateParams({ q: null, level: null, degree: null, stream: null, university: null, maxFee: null });
  }
  const levelLabel = (value: string) => value === "UG" ? "Undergraduate" : "Postgraduate";
  const universityLabel = (id: string) => universityOptions.find((item) => item.id === id)?.shortName || id;
  const chips = [
    ...levels.map((value) => ({ label: levelLabel(value), remove: () => setGroup("level", levels.filter((item) => item !== value)) })),
    ...degrees.map((value) => ({ label: value, remove: () => setGroup("degree", degrees.filter((item) => item !== value)) })),
    ...streams.map((value) => ({ label: value, remove: () => setGroup("stream", streams.filter((item) => item !== value)) })),
    ...universities.map((value) => ({ label: universityLabel(value), remove: () => setGroup("university", universities.filter((item) => item !== value)) })),
    ...(maxFee < feeCeiling ? [{ label: `Up to ${formatFee(maxFee)}`, remove: () => updateParams({ maxFee: null }) }] : []),
    ...(query.trim() ? [{ label: `Search: ${query}`, remove: () => updateParams({ q: null }) }] : []),
  ];

  const groups: Array<{ group: Group; title: string; options: Array<[string, string]>; primary?: number }> = [
    { group: "level", title: "Degree level", options: [["UG", "Undergraduate (UG)"], ["PG", "Postgraduate (PG)"]] },
    { group: "degree", title: "Degree", options: degreeOptions.map((value) => [value, `Online ${value}`]), primary: primaryDegreeCount || 7 },
    { group: "stream", title: "Stream", options: streamOptions.map((value) => [value, value]) },
    { group: "university", title: "University", options: universityOptions.map((university) => [university.id, university.name]) },
  ];

  function renderOption(group: Group, value: string, label: string, title: string) {
    const values = selected[group];
    const id = `filter-${group}-${value.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
    return <label key={value} className="uvc-option" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={values.includes(value)}
        onChange={() => {
          const next = toggleValue(values, value);
          setGroup(group, next);
          trackEvent("course_filter_applied", { filter_type: title, value, result_count: countMatches({ [group]: next }) });
        }}
      />
      <span className="uvc-option-label">{label}</span>
      <span className="uvc-option-count">{countMatches({ [group]: [value] })}</span>
    </label>;
  }

  const sliderValue = Math.min(Math.max(maxFee, feeMin), feeCeiling);
  const trackFee = () => trackEvent("course_filter_applied", { filter_type: "Total fee under", value: maxFee, result_count: countMatches() });

  return (
    <div className="uvc-body">
      <button
        type="button"
        className="uvc-filter-toggle"
        ref={filterToggle}
        aria-expanded={mobileFiltersOpen}
        aria-controls="uv-course-filters"
        onClick={() => setMobileFiltersOpen((open) => !open)}
      >
        <SlidersHorizontal size={20} aria-hidden="true" />
        Filters{chips.length ? ` (${chips.length})` : ""}
      </button>

      <div className="uvc-sort">
        <label htmlFor="course-sort" className="sr-only">Sort courses</label>
        <select id="course-sort" value={sort} onChange={(event) => updateParams({ sort: event.target.value === "relevance" ? null : event.target.value })}>
          <option value="relevance">Sort: relevance</option>
          <option value="feeAsc">Fee: low to high</option>
          <option value="feeDesc">Fee: high to low</option>
        </select>
      </div>

      <aside
        id="uv-course-filters"
        aria-label="Course filters"
        onKeyDown={(event) => { if (event.key === "Escape" && mobileFiltersOpen) { setMobileFiltersOpen(false); filterToggle.current?.focus(); } }}
        className={mobileFiltersOpen ? "uvc-filters is-open" : "uvc-filters"}
      >
        <div className="uvc-filters-head">
          <h2>Filters</h2>
          <button type="button" className="uvc-clear" onClick={clearFilters}>Clear all</button>
        </div>
        {groups.map(({ group, title, options, primary }) => {
          const visible = primary ? options.slice(0, primary) : options;
          const more = primary ? options.slice(primary) : [];
          const moreSelected = more.some(([value]) => selected[group].includes(value));
          return <fieldset key={group} className="uvc-group">
            <legend>{title}</legend>
            <div className="uvc-options">
              {visible.map(([value, label]) => renderOption(group, value, label, title))}
            </div>
            {more.length ? <details className="uvc-more" open={moreSelected || undefined}>
              <summary>More degrees ({more.length})</summary>
              <div className="uvc-options">{more.map(([value, label]) => renderOption(group, value, label, title))}</div>
            </details> : null}
          </fieldset>;
        })}
        <div className="uvc-group">
          <label htmlFor="course-max-fee" className="uvc-group-title">Maximum total tuition</label>
          <input
            type="range"
            id="course-max-fee"
            className="uvc-range"
            min={feeMin}
            max={feeCeiling}
            step={FEE_STEP}
            value={sliderValue}
            aria-valuetext={`Up to ${formatFee(sliderValue)}`}
            onChange={(event) => updateParams({ maxFee: Number(event.target.value) >= feeCeiling ? null : event.target.value }, true)}
            onMouseUp={trackFee}
            onTouchEnd={trackFee}
            onKeyUp={trackFee}
          />
          <div className="uvc-range-scale" aria-hidden="true"><span>{formatFee(feeMin)}</span><b>Up to {formatFee(sliderValue)}</b></div>
        </div>
        <button type="button" className="btn primary uvc-apply" onClick={() => { setMobileFiltersOpen(false); filterToggle.current?.focus(); }}>
          Show {filtered.length} results
        </button>
      </aside>

      <p className="uvc-count">
        <b role="status" aria-live="polite">{filtered.length} of {initialCourses.length} programs</b>
        <span> · Tuition shown. Check each program for current fees and eligibility.{feeGroup !== "indian" && sort !== "relevance" ? " Fee sorting uses the listed Indian tuition." : ""}</span>
      </p>
      <FeeGroupSwitch id="course-fee-group" className="uvc-fee-group" />

      <section className="uvc-results" id="course-results" data-count={filtered.length} aria-labelledby="course-results-title">
        <h2 id="course-results-title" className="sr-only">Programs</h2>
        {chips.length ? <ul className="uvc-chips" aria-label="Active filters">
          {chips.map((chip) => <li key={chip.label}>
            <button type="button" onClick={chip.remove} aria-label={`Remove ${chip.label} filter`}>
              <span>{chip.label}</span><X size={16} aria-hidden="true" />
            </button>
          </li>)}
        </ul> : null}

        {filtered.length ? <div className="uv-card-grid">
          {filtered.map((item) => <CourseCard key={item.id} course={item} trackSource="courses_list" />)}
        </div> : <div className="uv-empty">
          <div className="uv-empty-art" aria-hidden="true"><span><SearchX size={28} /></span><i /><i /></div>
          <h3>No programs match these filters</h3>
          <p>Try raising the fee limit or removing a filter.</p>
          <div className="uv-empty-actions">
            <button type="button" className="btn primary" onClick={clearFilters}>Clear filters</button>
            <Link href="/recommender" className="btn secondary">Find my course</Link>
          </div>
        </div>}
      </section>
    </div>
  );
}
