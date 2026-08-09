import type { Metadata } from "next";
import Link from "next/link";
import { CompareGate } from "@/components/compare-gate";
import { TrackOnMount } from "@/components/track-on-mount";
import { courses, courseWithUniversity, formatFee } from "@/data/catalog";
import { allComparisonPairs, buildComparisonRows } from "@/lib/comparisons";

export const metadata: Metadata = {
  title: "Compare Online Degrees",
  description: "Compare online degree fees, duration, approvals, universities, and specialisations.",
  alternates: { canonical: "/compare" },
};

export default async function ComparePage({ searchParams }: { searchParams?: Promise<{ add?: string }> }) {
  const params = await searchParams;
  // params.add === undefined means the query param is absent entirely (first visit) -> use the
  // default pair. params.add === "" means the user explicitly cleared every selection (by
  // removing the last picked course) -> must stay empty so the "select a program" state shows,
  // not silently repopulate with the default pair (that made the empty state unreachable).
  const selectedIds = params?.add !== undefined ? params.add.split(",").filter(Boolean).slice(0, 3) : ["mba-muj", "mba-amity"];
  const selected = courses.filter((course) => selectedIds.includes(course.id)).map(courseWithUniversity);
  const comparisonPairs = allComparisonPairs();
  const presets = [
    ["MBA: MUJ vs Amity", "mba-muj,mba-amity"],
    ["MBA: MUJ vs SMU", "mba-muj,mba-smu"],
    ["BCA: MUJ vs Amity", "bca-muj,bca-amity"],
    ["MCA: MUJ vs Amity", "mca-muj,mca-amity"],
    ["B.Com: MUJ vs SMU", "bcom-muj,bcom-smu"],
  ];
  const shell = { maxWidth: 1200, margin: "0 auto", paddingLeft: 24, paddingRight: 24, width: "100%", boxSizing: "border-box" as const };

  return (
    <>
      {selected.length >= 2 ? <TrackOnMount event="compare_view" params={{ course_ids: selected.map((course) => course.id) }} /> : null}
      <div style={{ background: "#F7F8F9", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ background: "#fff", borderBottom: "1px solid #EAEAEA" }}>
          <div style={{ ...shell, paddingTop: 28, paddingBottom: 28 }}>
            <div style={{ fontSize: 12, color: "#707070", marginBottom: 8 }}>
              <Link href="/" style={{ color: "#707070" }}>Home</Link> &gt; Compare
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "#363634", margin: 0 }}>Compare programs side by side</h1>
            <div style={{ fontSize: 14, color: "#696868", marginTop: 6 }}>
              Pick up to 3 programs. Fees, approvals and placements — nothing hidden.
            </div>
          </div>
        </div>

        <div style={{ ...shell, paddingTop: 28, paddingBottom: 64, flex: 1 }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#696868", letterSpacing: 0.4, marginBottom: 8 }}>TOP COMPARISONS THIS WEEK</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {presets.map(([label, add]) => (
                <Link href={`/compare?add=${add}`} style={{ border: "1px solid #CFDAE6", background: "#fff", borderRadius: 6, padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#363634" }} key={add}>
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "#696868", letterSpacing: 0.4, marginBottom: 8 }}>OR PICK PROGRAMS (UP TO 3)</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
              {courses.map((course) => {
                const item = courseWithUniversity(course);
                const isSelected = selectedIds.includes(course.id);
                // Toggling off always works; picking a 4th while 3 are already selected is a
                // no-op (matches static site.js: "else if(sel.length<3)sel.push(id)") rather than
                // silently bumping out the oldest pick, which would be a surprising swap the user
                // didn't ask for.
                const nextIds = isSelected
                  ? selectedIds.filter((id) => id !== course.id)
                  : selectedIds.length < 3
                    ? [...selectedIds, course.id]
                    : selectedIds;
                return (
                  <Link
                    href={`/compare?add=${nextIds.join(",")}`}
                    style={{
                      border: `1.5px solid ${isSelected ? "#544CC8" : "#CFDAE6"}`,
                      background: isSelected ? "rgba(84,76,200,0.08)" : "#fff",
                      color: isSelected ? "#544CC8" : "#555",
                      borderRadius: 999,
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                    key={course.id}
                  >
                    {item.name} · {item.university.shortName}
                  </Link>
                );
              })}
          </div>

          <CompareGate selectedCount={selected.length}>
            <div className="compare-table">
              <div className="compare-grid" style={{ gridTemplateColumns: `180px repeat(${selected.length}, 1fr)` }}>
                <div className="compare-head">CRITERIA</div>
                {selected.map((course) => (
                  <div className="compare-head compare-program" key={course.id}>
                    <strong>{course.name}</strong>
                    <small>{course.university.name}</small>
                  </div>
                ))}
                {buildComparisonRows(selected).flatMap((row) => [
                  <div className="compare-cell compare-row-label" key={`${row.label}-label`}>{row.label}</div>,
                  ...row.cells.map((cell, index) => (
                    <div
                      className="compare-cell"
                      style={cell.best ? { fontWeight: 700, background: "rgba(46,125,50,0.08)" } : undefined}
                      key={`${row.label}-${index}`}
                    >
                      {cell.value}
                    </div>
                  )),
                ])}
              </div>
            </div>
          </CompareGate>

          {comparisonPairs.length ? (
            <div style={{ marginTop: 40 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#696868", letterSpacing: 0.4, marginBottom: 8 }}>PUBLISHED COMPARISON PAGES</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {comparisonPairs.map((pair) => (
                  <Link
                    href={`/compare/${pair.key}/${pair.slug}`}
                    style={{ border: "1px solid #CFDAE6", background: "#fff", borderRadius: 6, padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#363634" }}
                    key={`${pair.key}/${pair.slug}`}
                  >
                    {pair.label}: {pair.left.university.shortName} vs {pair.right.university.shortName}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
