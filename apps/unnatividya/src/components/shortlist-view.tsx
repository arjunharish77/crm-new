"use client";

import Image from "next/image";
import Link from "next/link";
import { useShortlist } from "@/lib/use-shortlist";
import { courseWithUniversity, formatFee, type Course } from "@/data/catalog";
import { universityMedia } from "@/data/media";

export function ShortlistView({ courses }: { courses: Course[] }) {
  const { ids, toggle } = useShortlist();
  const saved = courses.filter((course) => ids.includes(course.id)).map(courseWithUniversity);

  if (!saved.length) {
    return (
      <>
        <div style={{ fontSize: 14, color: "#696868", marginBottom: 24 }}>
          Saved on this device — tap the heart on any course to add or remove it.
        </div>
        <div style={{ background: "#fff", border: "1px dashed #CFDAE6", borderRadius: 8, padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#363634" }}>Nothing saved yet</div>
          <div style={{ fontSize: 14, color: "#696868", marginTop: 8, marginBottom: 20 }}>
            Tap the heart on any course to keep it here while you decide.
          </div>
          <Link href="/courses" className="btn primary" style={{ display: "inline-flex", height: 44, alignItems: "center", padding: "0 22px" }}>
            Browse courses
          </Link>
        </div>
      </>
    );
  }

  const fees = saved.map((course) => course.fee);
  const minFee = Math.min(...fees);
  const maxFee = Math.max(...fees);
  const cheapest = saved.find((course) => course.fee === minFee)!;
  const highestRated = [...saved].sort((a, b) => b.rating - a.rating)[0];
  const bestPlacement = [...saved].sort((a, b) => b.university.placement - a.university.placement)[0];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div style={{ fontSize: 14, color: "#696868" }}>
          {saved.length} program{saved.length === 1 ? "" : "s"} saved · fees from {formatFee(minFee)} to {formatFee(maxFee)}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href={`/compare?add=${saved.map((course) => course.id).join(",")}`} className="btn primary" style={{ height: 40, fontSize: 13 }}>
            Compare all
          </Link>
          <Link href="/lead?intent=my-shortlist" data-open-lead className="btn secondary" style={{ height: 40, fontSize: 13 }}>
            Get all brochures
          </Link>
        </div>
      </div>

      <div className="grid four" style={{ marginBottom: 24 }}>
        {[
          ["Cheapest saved", `${formatFee(cheapest.fee)}`, `${cheapest.university.shortName}`],
          ["Fee spread", `${formatFee(minFee)} – ${formatFee(maxFee)}`, null],
          ["Highest rated", `${highestRated.rating} ★`, `${highestRated.university.shortName}`],
          ["Best placement rate", `${bestPlacement.university.placement}%`, `${bestPlacement.university.shortName}`],
        ].map(([label, value, sub]) => (
          <div key={label} style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 12, color: "#707070" }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#363634", marginTop: 2 }}>{value}{sub ? <span style={{ fontSize: 12, fontWeight: 400, color: "#707070" }}> {sub}</span> : null}</div>
          </div>
        ))}
      </div>

      <div className="grid three">
        {saved.map((course) => (
          <article className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }} key={course.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ position: "relative", width: 32, height: 32 }}>
                <Image src={universityMedia[course.universityId].logo} alt="" fill sizes="32px" style={{ objectFit: "contain" }} />
              </span>
              <button type="button" onClick={() => toggle(course.id)} style={{ border: "none", background: "none", color: "#544CC8", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>
                Remove
              </button>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#363634" }}>{course.name}</div>
              <div style={{ fontSize: 13, color: "#707070", marginTop: 2 }}>{course.university.name}</div>
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#555", flexWrap: "wrap" }}>
              <span>{course.duration}</span>
              <span><b style={{ color: "#363634" }}>{formatFee(course.fee)}</b> total</span>
              <span>EMI {course.emi}</span>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
              <Link href={`/courses/${course.slug}`} className="btn primary" style={{ flex: 1, height: 38, fontSize: 13 }}>View</Link>
              <Link href={`/lead?course=${course.id}&intent=enquire`} data-open-lead className="btn secondary" style={{ flex: 1, height: 38, fontSize: 13 }}>Enquire</Link>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
