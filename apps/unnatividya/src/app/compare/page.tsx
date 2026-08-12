import type { Metadata } from "next";
import Link from "next/link";
import { ComparePicker } from "@/components/compare-picker";
import { courses, courseWithUniversity } from "@/data/catalog";
import { allComparisonPairs } from "@/lib/comparisons";

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
  const allCourses = courses.map(courseWithUniversity);
  const comparisonPairs = allComparisonPairs();
  const presets = [
    ["MBA: all three", "mba-muj,mba-smu,mba-amity"],
    ["BCA: MUJ vs Amity", "bca-muj,bca-amity"],
    ["MCA: all three", "mca-muj,mca-smu,mca-amity"],
    ["B.Com: all three", "bcom-muj,bcom-smu,bcom-amity"],
  ];
  const shell = { maxWidth: 1200, margin: "0 auto", paddingLeft: 24, paddingRight: 24, width: "100%", boxSizing: "border-box" as const };

  return (
    <>
      <div style={{ background: "#F7F8F9", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ background: "#fff", borderBottom: "1px solid #EAEAEA" }}>
          <div style={{ ...shell, paddingTop: 28, paddingBottom: 28 }}>
            <div style={{ fontSize: 12, color: "#707070", marginBottom: 8 }}>
              <Link href="/" style={{ color: "#707070" }}>Home</Link> &gt; Compare
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "#363634", margin: 0 }}>Compare programs side by side</h1>
            <div style={{ fontSize: 14, color: "#696868", marginTop: 6 }}>
              Up to three programs. Total fee, EMI, approvals and placement records — the best value in each row is highlighted.
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

          <ComparePicker allCourses={allCourses} initialSelectedIds={selectedIds} />

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
