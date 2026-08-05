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
          <h1>Online universities we cover</h1>
          <p className="page-subtitle">
            Every university listed here is UGC-entitled to award online degrees. We verify approvals each admission cycle.
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
                  <div className="uni-row-media">
                    <Image
                      src={media.src}
                      alt={media.alt}
                      width={360}
                      height={220}
                      sizes="(max-width: 760px) 100vw, 210px"
                    />
                  </div>
                  <div>
                    <Link href={`/universities/${university.slug}`} className="uni-row-title">
                      {university.name}
                    </Link>
                    <div className="university-card-city">
                      {university.city} · Established {university.established}
                    </div>
                    <div className="trust-strip compact">
                      {university.approvals.slice(0, 3).map((approval) => (
                        <ApprovalBadge label={approval} className="level-badge UG" key={approval} />
                      ))}
                    </div>
                    <div className="uni-metrics">
                      <span><span style={{ color: "#FDB515" }}>★</span> <b>{university.rating}</b> ({university.reviews.toLocaleString("en-IN")} reviews)</span>
                      <span><b>{universityCourses.length}</b> online programs</span>
                      <span><b>{university.placement}%</b> placement rate</span>
                      <span>avg package <b>{university.avgPackage}</b></span>
                    </div>
                  </div>
                  <div className="uni-actions">
                    <Link href={`/universities/${university.slug}`} className="btn primary">View university</Link>
                    <Link href={`/lead?university=${university.id}`} className="btn secondary" data-open-lead>Enquire now</Link>
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
