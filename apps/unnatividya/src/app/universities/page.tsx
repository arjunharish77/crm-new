import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ApprovalBadge } from "@/components/approval-badge";
import { courses, universities } from "@/data/catalog";
import { universityMedia } from "@/data/media";

export const metadata: Metadata = {
  title: "Online Universities",
  description: "Compare approved online degree universities available on Unnati Vidya.",
  alternates: { canonical: "/universities" },
};

export default function UniversitiesPage() {
  return (
    <>
      <section className="page-kicker">
        <div className="container page-kicker-inner">
          <div className="breadcrumb">
            <Link href="/">Home</Link> &gt; Universities
          </div>
          <h1>Universities we cover</h1>
          <p className="page-subtitle">
            Three institutions. Every program is checked against the university&apos;s own page and the UGC-DEB entitlement notification before it is listed here.
          </p>
        </div>
      </section>

      <section className="section alt" style={{ paddingTop: 28 }}>
        <div className="container">
          <div className="uni-list">
            {universities.map((university) => {
              const universityCourses = courses.filter((course) => course.universityId === university.id);
              const media = universityMedia[university.id];

              return (
                <article className="card uni-row" key={university.id}>
                  <div className="uni-row-media" style={{ position: "relative" }}>
                    <Image
                      src={media.src}
                      alt={media.alt}
                      width={360}
                      height={220}
                      sizes="(max-width: 760px) 100vw, 280px"
                    />
                    <span style={{ position: "absolute", left: 10, top: 10, background: "#fff", borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, color: "#2E7D32", boxShadow: "0 1px 3px rgba(0,0,0,0.16)" }}>
                      VERIFIED THIS CYCLE
                    </span>
                  </div>
                  <div>
                    <Link href={`/universities/${university.slug}`} className="uni-row-title">
                      {university.name}
                    </Link>
                    <div className="university-card-city">
                      {university.city} · Established {university.established}
                    </div>
                    <p style={{ fontSize: 13, color: "#555", lineHeight: 1.55, maxWidth: 460, margin: "8px 0 0" }}>{university.about}</p>
                    <div className="trust-strip compact">
                      {university.approvals.slice(0, 3).map((approval) => (
                        <ApprovalBadge
                          label={approval}
                          style={{ fontSize: 11, fontWeight: 700, color: "#363634", background: "#F5F5F5", borderRadius: 999, whiteSpace: "nowrap", padding: "3px 9px" }}
                          key={approval}
                        />
                      ))}
                    </div>
                    <div className="uni-metrics">
                      <span><span style={{ color: "#FDB515" }}>★</span> <b>{university.rating}</b> ({university.reviews.toLocaleString("en-IN")} reviews)</span>
                      <span><b>{universityCourses.length}</b> online programs</span>
                      <span><b>{university.placement}%</b> placement rate</span>
                      <span>avg package <b>{university.avgPackage}</b></span>
                      <span>annual fee from <b>{university.feeFrom}</b></span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="uni-actions">
                      <Link href={`/universities/${university.slug}`} className="btn primary">View university</Link>
                      <Link href={`/lead?university=${university.id}`} className="btn secondary" data-open-lead>Enquire now</Link>
                    </div>
                    <Link href={`/courses?university=${university.id}`} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "#544CC8" }}>
                      See all {universityCourses.length} programs →
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="dark-decision-card">
            <div>
              <h2>Can&apos;t decide between universities?</h2>
              <p>Compare approvals, fees and placements side by side, or let the AI shortlist for you.</p>
            </div>
            <div>
              <Link href="/compare" className="btn primary">Compare now</Link>
              <Link href="/recommender" className="btn dark-outline">Ask the AI</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
