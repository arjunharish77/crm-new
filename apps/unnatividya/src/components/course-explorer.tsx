"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { trackEvent } from "@/components/analytics";
import { SaveButton } from "@/components/save-button";
import { formatFee } from "@/lib/catalog-format";
import { type Course, type University } from "@/data/catalog";
import { universityMedia } from "@/data/media";

type CourseItem = Course & { university: University };
type SortKey = "popular" | "feeAsc" | "feeDesc" | "rating";

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function levelStyle(level: CourseItem["level"]) {
  return {
    fontSize: 11,
    fontWeight: 700,
    color: level === "PG" ? "#4D00FF" : "#0F5BB8",
    background: level === "PG" ? "rgba(77,0,255,0.10)" : "rgba(79,168,255,0.12)",
    borderRadius: 999,
    whiteSpace: "nowrap" as const,
    padding: "3px 9px",
  };
}

export function CourseExplorer({ courses: initialCourses }: { courses: CourseItem[] }) {
  const params = useSearchParams();
  const feeCeiling = Math.max(1000, Math.ceil(Math.max(0, ...initialCourses.map(course=>course.fee))/1000)*1000);
  const streamOptions = [...new Set(initialCourses.map(course=>course.stream))].sort();
  const universityOptions = [...new Map(initialCourses.map(course=>[course.universityId, course.university])).values()].sort((a,b)=>a.name.localeCompare(b.name));
  const readList = (key: string, allowed: string[]) => [...new Set(params.getAll(key).flatMap(value=>value.split(",")).filter(value=>allowed.includes(value)))];
  const query = (params.get("q") || "").slice(0,200);
  const levels = readList("level",["UG","PG"]);
  const streams = readList("stream",streamOptions);
  // Keep existing short-name links working while writing stable university IDs.
  const universities = [...new Set(params.getAll("university").flatMap(value=>value.split(",")).map(value=>universityOptions.find(university=>university.id===value || university.shortName===value)?.id).filter((value): value is University["id"]=>Boolean(value)))];
  const feeParam = Number(params.get("maxFee"));
  const maxFee = params.has("maxFee") && Number.isFinite(feeParam) && feeParam>=0 ? Math.min(Math.floor(feeParam),feeCeiling) : feeCeiling;
  const sort: SortKey = ["feeAsc","feeDesc","rating"].includes(params.get("sort") || "") ? params.get("sort") as SortKey : "popular";
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filterToggle = useRef<HTMLButtonElement>(null);
  function updateFilters(changes: Record<string,string | string[] | null>, replace = false) {
    const next = new URLSearchParams(window.location.search);
    for (const [key,value] of Object.entries(changes)) {
      next.delete(key);
      if (Array.isArray(value)) value.forEach(item=>next.append(key,item));
      else if (value !== null && value !== "") next.set(key,value);
    }
    const url = `${window.location.pathname}${next.size ? `?${next}` : ""}${window.location.hash}`;
    if (url !== window.location.pathname+window.location.search+window.location.hash) window.history[replace ? "replaceState" : "pushState"](null,"",url);
  }
  const setLevels = (values: string[])=>updateFilters({level:values});
  const setStreams = (values: string[])=>updateFilters({stream:values});
  const setUniversities = (values: string[])=>updateFilters({university:values});
  const activeFilterCount = levels.length + streams.length + universities.length + (maxFee < feeCeiling ? 1 : 0) + (query.trim() ? 1 : 0);

  function countMatches(overrides: { levels?: string[]; streams?: string[]; universities?: string[]; maxFee?: number } = {}) {
    const activeLevels = overrides.levels ?? levels;
    const activeStreams = overrides.streams ?? streams;
    const activeUniversities = overrides.universities ?? universities;
    const activeMaxFee = overrides.maxFee ?? maxFee;
    const text = query.trim().toLowerCase();
    return initialCourses.filter((course) => {
      const search = [course.name, course.shortName, course.stream, course.university.name, course.university.shortName, ...course.specializations].join(" ").toLowerCase();
      return (
        (!text || search.includes(text)) &&
        (!activeLevels.length || activeLevels.includes(course.level)) &&
        (!activeStreams.length || activeStreams.includes(course.stream)) &&
        (!activeUniversities.length || activeUniversities.includes(course.universityId)) &&
        course.fee <= activeMaxFee
      );
    }).length;
  }

  const text = query.trim().toLowerCase();
  const filtered = initialCourses
      .filter((course) => {
        const search = [course.name, course.shortName, course.stream, course.university.name, course.university.shortName, ...course.specializations].join(" ").toLowerCase();
        return (
          (!text || search.includes(text)) &&
          (!levels.length || levels.includes(course.level)) &&
          (!streams.length || streams.includes(course.stream)) &&
          (!universities.length || universities.includes(course.universityId)) &&
          course.fee <= maxFee
        );
      })
      .sort((a, b) => {
        if (sort === "feeAsc") return a.fee - b.fee;
        if (sort === "feeDesc") return b.fee - a.fee;
        if (sort === "rating") return b.rating - a.rating;
        return b.reviews - a.reviews;
      });

  function clearFilters() {
    updateFilters({q:null,level:null,stream:null,university:null,maxFee:null,sort:null});
  }
  const chips = [
    ...levels.map(value=>({label:value==="UG"?"Undergraduate":"Postgraduate",remove:()=>setLevels(levels.filter(item=>item!==value))})),
    ...streams.map(value=>({label:value,remove:()=>setStreams(streams.filter(item=>item!==value))})),
    ...universities.map(value=>({label:universityOptions.find(item=>item.id===value)?.shortName || value,remove:()=>setUniversities(universities.filter(item=>item!==value))})),
    ...(maxFee<feeCeiling?[{label:`Up to ${formatFee(maxFee)}`,remove:()=>updateFilters({maxFee:null})}]:[]),
    ...(query.trim()?[{label:`Search: ${query}`,remove:()=>updateFilters({q:null})}]:[]),
  ];

  return (
    <>
      <button
        type="button"
        className="uv-filter-toggle"
        ref={filterToggle}
        aria-expanded={mobileFiltersOpen}
        aria-controls="uv-course-filters"
        onClick={() => setMobileFiltersOpen((open) => !open)}
      >
        <SlidersHorizontal size={16} />
        Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
      </button>
      <div className="uv-courses-layout" style={{ display: "grid", gridTemplateColumns: "250px 1fr", gap: 24, alignItems: "start" }}>
      <aside
        id="uv-course-filters"
        aria-label="Course filters"
        onKeyDown={event=>{if(event.key==="Escape" && mobileFiltersOpen){setMobileFiltersOpen(false);filterToggle.current?.focus();}}}
        className={mobileFiltersOpen ? "uv-course-filter-panel uv-open" : "uv-course-filter-panel"}
        style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 20, position: "sticky", top: 88 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#363634" }}>Filters</span>
          <button type="button" onClick={clearFilters} style={{ border: "none", background: "none", fontSize: 12, fontWeight: 600, color: "#544CC8", cursor: "pointer", padding: 0 }}>
            Clear all
          </button>
        </div>
        {[
          ["Degree level", [["UG", "Undergraduate (UG)"], ["PG", "Postgraduate (PG)"]], levels, setLevels],
          ["Stream", streamOptions.map(value=>[value,value]), streams, setStreams],
          ["University", universityOptions.map(university=>[university.id,university.shortName]), universities, setUniversities],
        ].map(([heading, values, selected, setter]) => (
          <div key={heading as string}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#363634", marginBottom: 8 }}>{heading as string}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              {(values as string[][]).map(([value, label]) => {
                const headingText = heading as string;
                const overrideKey = headingText === "Degree level" ? "levels" : headingText === "Stream" ? "streams" : "universities";
                const optionCount = countMatches({ [overrideKey]: [value] });
                return (
                  <label key={value} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 14, color: "#555", cursor: "pointer" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        checked={(selected as string[]).includes(value)}
                        onChange={() => {
                          const next = toggleValue(selected as string[], value);
                          (setter as (next: string[]) => void)(next);
                          trackEvent("course_filter_applied", {
                            filter_type: headingText,
                            value,
                            result_count: countMatches({ [overrideKey]: next }),
                          });
                        }}
                        type="checkbox"
                        style={{ accentColor: "#544CC8", width: 16, height: 16 }}
                      />
                      {label}
                    </span>
                    <span style={{ color: "#707070", fontSize: 12 }}>{optionCount}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        <label htmlFor="course-max-fee" style={{ fontSize: 13, fontWeight: 700, color: "#363634", marginBottom: 8 }}>Maximum total tuition</label>
        <input
          type="range"
          id="course-max-fee"
          min={0}
          max={feeCeiling}
          step={1000}
          value={maxFee}
          onChange={(event) => updateFilters({maxFee:Number(event.target.value)>=feeCeiling?null:event.target.value},true)}
          onMouseUp={() => trackEvent("course_filter_applied", { filter_type: "Total fee under", value: maxFee, result_count: countMatches() })}
          onTouchEnd={() => trackEvent("course_filter_applied", { filter_type: "Total fee under", value: maxFee, result_count: countMatches() })}
          style={{ width: "100%", accentColor: "#544CC8" }}
        />
        <div style={{ fontSize: 13, color: "#696868", marginTop: 4 }}>Up to {formatFee(maxFee)}</div>
        <button type="button" className="uv-filter-apply" onClick={() => {setMobileFiltersOpen(false);filterToggle.current?.focus();}}>
          Show {filtered.length} results
        </button>
      </aside>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
          <input
            value={query}
            aria-label="Search courses"
            maxLength={200}
            onChange={(event) => updateFilters({q:event.target.value},true)}
            onBlur={() => query.trim() && trackEvent("course_search", { result_count: filtered.length })}
            placeholder="Search courses, universities or streams…"
            style={{ height: 40, width: 280, maxWidth: "100%", padding: "0 14px", border: "1px solid #CFDAE6", borderRadius: 4, fontSize: 14, color: "#555", outlineColor: "#544CC8", background: "#fff" }}
          />
          <select aria-label="Sort courses" value={sort} onChange={(event) => updateFilters({sort:event.target.value==="popular"?null:event.target.value})} style={{ height: 40, padding: "0 12px", border: "1px solid #CFDAE6", borderRadius: 4, fontSize: 13, color: "#555", background: "#fff" }}>
            <option value="popular">Sort: most reviewed</option>
            <option value="feeAsc">Fee: low to high</option>
            <option value="feeDesc">Fee: high to low</option>
            <option value="rating">Highest rated</option>
          </select>
        </div>
        <p role="status" aria-live="polite" style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>
          {filtered.length} of {initialCourses.length} programs
        </p>
        <p style={{fontSize:13,color:"#555",marginBottom:16}}>Tuition shown. Check each program for current fees and eligibility.</p>
        {chips.length ? <div className="uv-filter-chips" aria-label="Active filters">{chips.map(chip=><button type="button" key={chip.label} onClick={chip.remove} aria-label={`Remove ${chip.label} filter`}>{chip.label}<span aria-hidden="true"> ×</span></button>)}</div> : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {filtered.map((item) => (
            <article
              className="uv-course-list-card"
              key={item.id}
              style={{
                background: "#fff",
                border: "1px solid #CFDAE6",
                borderRadius: 8,
                padding: 20,
                display: "grid",
                gridTemplateColumns: "56px 1fr auto",
                gap: 16,
              }}
            >
              <div style={{ width: 56, height: 56, border: "1px solid #EAEAEA", borderRadius: 8, background: "#F7F8F9", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <Image src={universityMedia[item.universityId].logo} alt={`${item.university.shortName} logo`} width={44} height={44} style={{ objectFit: "contain" }} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={levelStyle(item.level)}>{item.level}</span>
                    <span style={{ fontSize: 12, color: "#707070" }}>{item.stream}</span>
                  </div>
                  <SaveButton courseId={item.id} size={28} />
                </div>
                <Link href={`/courses/${item.slug}`} style={{ fontSize: 18, fontWeight: 700, color: "#363634" }}>
                  {item.name} — {item.university.name}
                </Link>
                <div style={{ display: "flex", gap: 20, fontSize: 13, color: "#555", marginTop: 8, flexWrap: "wrap" }}>
                  <span><span style={{ color: "#FDB515" }}>★</span> <b style={{ color: "#363634" }}>{item.rating}</b> ({item.reviews.toLocaleString("en-IN")} reviews)</span>
                  <span>{item.duration}</span>
                  <span><b style={{ color: "#363634" }}>{formatFee(item.fee)}</b> total</span>
                  <span>Financing: {item.emi}</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  {item.specializations.slice(0, 4).map((spec) => (
                    <span style={{ fontSize: 11, color: "#696868", background: "#F5F5F5", borderRadius: 999, padding: "3px 9px" }} key={spec}>
                      {spec}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, justifyContent: "center", minWidth: 150 }}>
                <Link
                  href={`/courses/${item.slug}`}
                  data-track-event="course_card_click"
                  data-track-params={JSON.stringify({ course_id: item.id, action: "view" })}
                  style={{ textAlign: "center", height: 38, lineHeight: "38px", background: "#544CC8", color: "#fff", borderRadius: 4, fontSize: 13, fontWeight: 700 }}
                >
                  View details
                </Link>
                <Link href={`/lead?course=${item.id}&intent=enquire`} data-open-lead style={{ textAlign: "center", height: 38, lineHeight: "38px", background: "#fff", border: "1.5px solid #555", borderRadius: 4, fontSize: 13, fontWeight: 700, color: "#555" }}>
                  Apply now
                </Link>
                <Link
                  href={`/compare?add=${item.id}`}
                  data-track-event="compare_course_added"
                  data-track-params={JSON.stringify({ course_id: item.id })}
                  style={{ textAlign: "center", fontSize: 12, fontWeight: 600 }}
                >
                  + Add to compare
                </Link>
              </div>
            </article>
          ))}
        </div>
        {!filtered.length ? (
          <div className="illustrated-empty-state">
            <Image className="state-illustration" src="/states/no-course-matches.webp" alt="" width={800} height={600} sizes="(max-width: 400px) 60vw, 240px" />
            <p>No courses match this selection. Remove a filter above or start again.</p>
            <button type="button" className="btn ghost" onClick={clearFilters}>Reset search and filters</button>
          </div>
        ) : null}
      </div>
      </div>
    </>
  );
}
