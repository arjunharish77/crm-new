"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatFee, type Course, type University } from "@/data/catalog";
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
    color: level === "PG" ? "#4D00FF" : "#4FA8FF",
    background: level === "PG" ? "rgba(77,0,255,0.10)" : "rgba(79,168,255,0.12)",
    borderRadius: 999,
    whiteSpace: "nowrap" as const,
    padding: "3px 9px",
  };
}

export function CourseExplorer({ courses: initialCourses, initialQuery = "" }: { courses: CourseItem[]; initialQuery?: string }) {
  const feeCeiling = useMemo(
    () => Math.max(200000, ...initialCourses.map((course) => Math.ceil(course.fee / 10000) * 10000)),
    [initialCourses],
  );
  const [query, setQuery] = useState(initialQuery);
  const [levels, setLevels] = useState<string[]>([]);
  const [streams, setStreams] = useState<string[]>([]);
  const [universities, setUniversities] = useState<string[]>([]);
  const [maxFee, setMaxFee] = useState(feeCeiling);
  const [sort, setSort] = useState<SortKey>("popular");

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return initialCourses
      .filter((course) => {
        const search = [course.name, course.shortName, course.stream, course.university.name, course.university.shortName, ...course.specializations].join(" ").toLowerCase();
        return (
          (!text || search.includes(text)) &&
          (!levels.length || levels.includes(course.level)) &&
          (!streams.length || streams.includes(course.stream)) &&
          (!universities.length || universities.includes(course.university.shortName)) &&
          course.fee <= maxFee
        );
      })
      .sort((a, b) => {
        if (sort === "feeAsc") return a.fee - b.fee;
        if (sort === "feeDesc") return b.fee - a.fee;
        if (sort === "rating") return b.rating - a.rating;
        return b.reviews - a.reviews;
      });
  }, [initialCourses, levels, maxFee, query, sort, streams, universities]);

  function clearFilters() {
    setQuery("");
    setLevels([]);
    setStreams([]);
    setUniversities([]);
    setMaxFee(feeCeiling);
    setSort("popular");
  }

  return (
    <div className="uv-courses-layout" style={{ display: "grid", gridTemplateColumns: "250px 1fr", gap: 24, alignItems: "start" }}>
      <aside style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 20, position: "sticky", top: 88 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#363634" }}>Filters</span>
          <button type="button" onClick={clearFilters} style={{ border: "none", background: "none", fontSize: 12, fontWeight: 600, color: "#544CC8", cursor: "pointer", padding: 0 }}>
            Clear all
          </button>
        </div>
        {[
          ["Degree level", [["UG", "Undergraduate (UG)"], ["PG", "Postgraduate (PG)"]], levels, setLevels],
          ["Stream", [["Management", "Management"], ["IT & Computers", "IT & Computers"], ["Commerce", "Commerce"], ["Arts & Humanities", "Arts & Humanities"]], streams, setStreams],
          ["University", [["MUJ", "MUJ"], ["SMU", "SMU"], ["Amity", "Amity"]], universities, setUniversities],
        ].map(([heading, values, selected, setter]) => (
          <div key={heading as string}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#363634", marginBottom: 8 }}>{heading as string}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              {(values as string[][]).map(([value, label]) => (
                <label key={value} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#555", cursor: "pointer" }}>
                  <input
                    checked={(selected as string[]).includes(value)}
                    onChange={() => (setter as (next: string[]) => void)(toggleValue(selected as string[], value))}
                    type="checkbox"
                    style={{ accentColor: "#544CC8", width: 16, height: 16 }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        ))}
        <div style={{ fontSize: 13, fontWeight: 700, color: "#363634", marginBottom: 8 }}>Total fee under</div>
        <input type="range" min="50000" max={feeCeiling} step="10000" value={maxFee} onChange={(event) => setMaxFee(Number(event.target.value))} style={{ width: "100%", accentColor: "#544CC8" }} />
        <div style={{ fontSize: 13, color: "#696868", marginTop: 4 }}>Up to {formatFee(maxFee)}</div>
      </aside>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search courses…" style={{ height: 40, width: 280, padding: "0 14px", border: "1px solid #CFDAE6", borderRadius: 4, fontSize: 14, color: "#555", outlineColor: "#544CC8", background: "#fff" }} />
          <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} style={{ height: 40, padding: "0 12px", border: "1px solid #CFDAE6", borderRadius: 4, fontSize: 13, color: "#555", background: "#fff" }}>
            <option value="popular">Sort: most popular</option>
            <option value="feeAsc">Fee: low to high</option>
            <option value="feeDesc">Fee: high to low</option>
            <option value="rating">Highest rated</option>
          </select>
        </div>
        <div style={{ fontSize: 13, color: "#696868", marginBottom: 16 }}>
          Showing {filtered.length} of {initialCourses.length} programs
        </div>

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
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={levelStyle(item.level)}>{item.level}</span>
                  <span style={{ fontSize: 12, color: "#707070" }}>{item.stream}</span>
                </div>
                <Link href={`/courses/${item.slug}`} style={{ fontSize: 18, fontWeight: 700, color: "#363634" }}>
                  {item.name} — {item.university.name}
                </Link>
                <div style={{ display: "flex", gap: 20, fontSize: 13, color: "#555", marginTop: 8, flexWrap: "wrap" }}>
                  <span><span style={{ color: "#FDB515" }}>★</span> <b style={{ color: "#363634" }}>{item.rating}</b> ({item.reviews.toLocaleString("en-IN")} reviews)</span>
                  <span>{item.duration}</span>
                  <span><b style={{ color: "#363634" }}>{formatFee(item.fee)}</b> total</span>
                  <span>EMI from {item.emi}</span>
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
                <Link href={`/courses/${item.slug}`} style={{ textAlign: "center", height: 38, lineHeight: "38px", background: "#544CC8", color: "#fff", borderRadius: 4, fontSize: 13, fontWeight: 700 }}>View details</Link>
                <Link href={`/lead?course=${item.id}&intent=enquire`} data-open-lead style={{ textAlign: "center", height: 38, lineHeight: "38px", background: "#fff", border: "1.5px solid #555", borderRadius: 4, fontSize: 13, fontWeight: 700, color: "#555" }}>
                  Enquire now
                </Link>
                <Link href={`/compare?add=${item.id}`} style={{ textAlign: "center", fontSize: 12, fontWeight: 600 }}>+ Add to compare</Link>
              </div>
            </article>
          ))}
        </div>
        {!filtered.length ? (
          <div style={{ display: "block", background: "#fff", border: "1px dashed #CFDAE6", borderRadius: 8, padding: 40, textAlign: "center", color: "#707070", fontSize: 14, marginTop: 14 }}>
            No courses match these filters. Try clearing a filter or two.
          </div>
        ) : null}
      </div>
    </div>
  );
}
