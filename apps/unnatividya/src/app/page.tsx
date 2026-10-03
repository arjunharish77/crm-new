export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ApprovalBadge } from "@/components/approval-badge";
import { JsonLd } from "@/components/json-ld";
import { SaveButton } from "@/components/save-button";
import { StickyMobileBar } from "@/components/sticky-mobile-bar";
import { formatFee } from "@/lib/catalog-format";
import { learningMedia, universityMedia } from "@/data/media";

const homeFaqs: Array<[string, string]> = [
  ["Are online degrees valid for government jobs?", "Yes. UGC-entitled online degrees are legally equivalent to on-campus degrees for government jobs, PSU recruitment and higher studies."],
  ["Is counselling really free?", "Yes — universities compensate us equally, so counselling costs you nothing and our advice carries no commission bias."],
  ["Can I pay via EMI?", "Every listed program offers no-cost EMI through education loan partners, plus semester-wise payment options."],
  ["How do you verify fees and approvals?", "We check every fee, approval and admission date against the university's own published pages each admission cycle, and flag anything we can't independently confirm — see our full verification process."],
  ["Will my certificate say \"online\"?", "No. A UGC-entitled online degree carries the same certificate as the on-campus program — there is no \"online\" marking that affects how employers or government bodies treat it."],
];

const streamIllustrations: Record<string, string> = {
  Management: "management",
  "IT & Computers": "it-computer-applications",
  Commerce: "commerce-finance",
  "Arts & Humanities": "arts-humanities",
};

const STREAMS = ["Management", "IT & Computers", "Commerce", "Arts & Humanities"] as const;

const pageWidth: CSSProperties = {
  maxWidth: 1200,
  margin: "0 auto",
  paddingLeft: 24,
  paddingRight: 24,
  width: "100%",
  boxSizing: "border-box",
};

const sectionTitle: CSSProperties = {
  fontSize: 26,
  fontWeight: 700,
  color: "#363634",
  margin: 0,
};

const primaryButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 38,
  background: "#544CC8",
  color: "#fff",
  borderRadius: 4,
  fontSize: 13,
  fontWeight: 700,
};

const secondaryButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 38,
  background: "#fff",
  border: "1.5px solid #555",
  borderRadius: 4,
  fontSize: 13,
  fontWeight: 700,
  color: "#555",
};

const universityDisplayName = (id: string, name: string) => id === "amity" ? "Amity University Online" : name;

export default async function HomePage() {
  const catalog = await getPublishedCatalog();
  const { courses, courseWithUniversity, universities } = catalog;
  // Deliberately spread across all 3 universities (includes an SMU pick), matching the design's
  // curated set rather than the catalog's default sort order.
  const popularCourseIds = ["mba-muj", "bca-muj", "mca-muj", "mba-smu", "bcom-muj", "msc-data-science-amity"];
  const popular = popularCourseIds
    .map((id) => courses.find((course) => course.id === id))
    .filter((course): course is (typeof courses)[number] => Boolean(course))
    .map(courseWithUniversity);

  const cheapestMba = courses
    .filter((course) => course.shortName === "MBA")
    .map(courseWithUniversity)
    .sort((a, b) => a.fee - b.fee)[0];

  const topAvgPackageUniversity = [...universities].sort((a, b) => Number(b.avgPackage.replace(/[^\d.]/g, "")) - Number(a.avgPackage.replace(/[^\d.]/g, "")))[0];

  const streamStats = STREAMS.map((stream) => {
    const streamCourses = courses.filter((course) => course.stream === stream);
    const cheapest = [...streamCourses].sort((a, b) => a.fee - b.fee)[0];
    return {
      stream,
      count: streamCourses.length,
      examples: Array.from(new Set(streamCourses.map((course) => course.shortName))).slice(0, 3).join(", "),
      fromFee: cheapest ? formatFee(cheapest.fee) : null,
    };
  });

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: homeFaqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
  };

  return <PublishedCatalogBoundary>{(
    <>
      <JsonLd data={faqJsonLd} />
      <section style={{ background: "linear-gradient(180deg,#F4F3FC 0%,#fff 100%)", borderBottom: "1px solid #F5F5F5" }}>
        <div
          className="uv-home-hero-grid"
          style={{
            ...pageWidth,
            paddingTop: 40,
            paddingBottom: 36,
            display: "grid",
            gridTemplateColumns: "1.05fr 0.95fr",
            gap: 40,
            alignItems: "start",
          }}
        >
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #CFDAE6", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#696868" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#2E7D32", display: "inline-block", flexShrink: 0 }} aria-hidden="true" />
              Explore undergraduate and postgraduate degrees
            </div>
            <h1 className="uv-home-title" style={{ fontSize: 43, lineHeight: 1.1, fontWeight: 700, color: "#363634", margin: "18px 0 14px", textWrap: "pretty" }}>
              Find an online degree that fits you.
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.55, color: "#555", margin: "0 0 20px", maxWidth: 520 }}>
              Explore Manipal University Jaipur, Sikkim Manipal University and Amity Online. Compare tuition, entry requirements and study options.
            </p>
            <form className="uv-home-search" role="search" aria-label="Find a course" action="/courses" method="get" style={{ display: "flex", gap: 0, maxWidth: 520, border: "1.5px solid #CFDAE6", borderRadius: 6, overflow: "hidden", background: "#fff" }}>
              <input name="q" maxLength={200} aria-label="Search courses" placeholder="Search a course, e.g. Online MBA" style={{ flex: 1, height: 52, border: "none", padding: "0 18px", fontSize: 15, color: "#555", outline: "none", minWidth: 0 }} />
              <button
                type="submit"
                data-track-event="course_search"
                data-track-params={JSON.stringify({ source: "homepage_hero" })}
                style={{ display: "flex", alignItems: "center", padding: "0 26px", background: "#544CC8", color: "#fff", fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer" }}
              >
                Search
              </button>
            </form>
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#707070" }}>Browse:</span>
              {[
                ["Online MBA", "/courses?q=MBA"],
                ["Online BCA", "/courses?q=BCA"],
                ["Online MCA", "/courses?q=MCA"],
                ["Online B.Com", "/courses?q=BCom"],
              ].map(([label, href]) => (
                <Link href={href} key={label} style={{ fontSize: 13, fontWeight: 600, color: "#555", border: "1px solid #D8D7D6", borderRadius: 999, padding: "5px 12px" }}>
                  {label}
                </Link>
              ))}
            </div>
            <p className="uv-home-catalog-summary"><Link href="/courses">{courses.length} programs</Link><span aria-hidden="true"> · </span><Link href="/universities">{universities.length} universities</Link></p>
          </div>

          <div className="uv-home-visual" style={{ position: "relative" }}>
            <div className="uv-home-image" style={{ height: 360, borderRadius: 8, overflow: "hidden", position: "relative" }}>
              <Image src={learningMedia.src} alt={learningMedia.alt} fill sizes="(max-width: 900px) calc(100vw - 48px), 480px" style={{ objectFit: "cover" }} priority />
            </div>
            {cheapestMba ? (
              <div className="uv-home-visual-fact" style={{ position: "absolute", left: -16, bottom: 74, background: "#fff", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.16)", padding: "12px 16px", maxWidth: 230 }}>
                <div style={{ fontSize: 11, color: "#707070", fontWeight: 600 }}>Lowest MBA in our catalog</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#363634", marginTop: 2 }}>{formatFee(cheapestMba.fee)}</div>
                <div style={{ fontSize: 12, color: "#696868", marginTop: 2 }}>{cheapestMba.university.shortName} · EMI {cheapestMba.emi}</div>
              </div>
            ) : null}
            {topAvgPackageUniversity ? (
              <div className="uv-home-visual-fact" style={{ position: "absolute", right: -16, top: 24, background: "#fff", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.16)", padding: "12px 16px", maxWidth: 200 }}>
                <div style={{ fontSize: 11, color: "#707070", fontWeight: 600 }}>Average package</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#363634", marginTop: 2 }}>{topAvgPackageUniversity.avgPackage}</div>
                <div style={{ fontSize: 12, color: "#696868", marginTop: 2 }}>{topAvgPackageUniversity.shortName} online learners</div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div style={{ borderBottom: "1px solid #F5F5F5", background: "#fff" }}>
        <div style={{ ...pageWidth, paddingTop: 16, paddingBottom: 16, display: "flex", gap: 32, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#707070", fontWeight: 600, letterSpacing: 0.5 }}>APPROVALS THAT MATTER</span>
          {["ugc", "naac", "aicte", "wes", "aiu"].map((slug) => (
            <span key={slug} style={{ position: "relative", width: 44, height: 24 }}>
              <Image src={`/approvals/${slug}.svg`} alt={slug.toUpperCase()} fill sizes="44px" style={{ objectFit: "contain" }} />
            </span>
          ))}
          <Link href="/how-we-verify" style={{ fontSize: 13, fontWeight: 600, color: "#544CC8" }}>How we verify →</Link>
        </div>
      </div>

      <section className="uv-home-ai-grid" style={{ ...pageWidth, paddingTop: 56, paddingBottom: 56, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, alignItems: "center" }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(84,76,200,0.10)", color: "#544CC8", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "linear-gradient(135deg,#4F46E5,#7C3AED)", display: "inline-block" }} aria-hidden="true" />
            Course matching
          </div>
          <h2 style={{ ...sectionTitle, margin: "14px 0 10px" }}>Start with your goals and budget.</h2>
          <p style={{ fontSize: 15, color: "#696868", lineHeight: 1.6, margin: "0 0 20px", maxWidth: 460 }}>
            Explore an initial shortlist based on your preferences. Check the course’s entry requirements and confirm eligibility with the university before applying.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/recommender" style={{ height: 46, display: "inline-flex", alignItems: "center", padding: "0 24px", background: "linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%)", color: "#fff", borderRadius: 4, fontSize: 15, fontWeight: 700 }}>
              Get my shortlist
            </Link>
            <Link href="/courses" style={{ ...secondaryButton, height: 46, padding: "0 24px", fontSize: 15 }}>Compare manually</Link>
          </div>
          <div style={{ fontSize: 12, color: "#707070", marginTop: 12 }}>Takes about two minutes · no sign-up to see results</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div style={{ height: 160, borderRadius: 6, overflow: "hidden", position: "relative" }}>
            <Image src="/hero/recommender-preview.webp" alt="Course matching preview" fill sizes="(max-width: 900px) calc(100vw - 98px), 480px" style={{ objectFit: "cover" }} />
          </div>
          <div style={{ fontSize: 13, color: "#696868", marginTop: 14, lineHeight: 1.5 }}>
            Preference-based suggestions are a starting point, not an admission decision.
          </div>
        </div>
      </section>

      <section style={{ background: "#F7F8F9", borderTop: "1px solid #EAEAEA", borderBottom: "1px solid #EAEAEA" }}>
        <div style={{ ...pageWidth, paddingTop: 56, paddingBottom: 56 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <h2 style={sectionTitle}>Popular online degrees</h2>
            <Link href="/courses" style={{ fontSize: 14, fontWeight: 600 }}>Browse all {courses.length} →</Link>
          </div>
          <p style={{ fontSize: 14, color: "#707070", margin: "0 0 24px" }}>
            Compare listed tuition and duration, then open a course for its requirements and current fee details.
          </p>
          <div className="uv-home-three-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
            {popular.map((course) => (
              <article style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 18, display: "flex", flexDirection: "column", gap: 10 }} key={course.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: course.level === "PG" ? "#4D00FF" : "#0F5BB8", background: course.level === "PG" ? "rgba(77,0,255,0.10)" : "rgba(79,168,255,0.12)", borderRadius: 999, whiteSpace: "nowrap", padding: "3px 9px" }}>{course.level}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, color: "#555" }}><span style={{ color: "#FDB515" }}>★</span> {course.rating}</span>
                    <SaveButton courseId={course.id} size={28} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#363634" }}>{course.name}</div>
                  <div style={{ fontSize: 13, color: "#707070", marginTop: 2 }}>{universityDisplayName(course.university.id, course.university.name)}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {course.specializations.slice(0, 3).map((spec) => (
                    <span key={spec} style={{ fontSize: 11, color: "#696868", background: "#F7F8F9", border: "1px solid #EAEAEA", borderRadius: 999, padding: "2px 8px" }}>{spec}</span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#555", flexWrap: "wrap", borderTop: "1px solid #F5F5F5", paddingTop: 10, marginTop: "auto" }}>
                  <span>{course.duration}</span>
                  <span><b style={{ color: "#363634" }}>{formatFee(course.fee)}</b> total</span>
                  <span>EMI {course.emi}</span>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <Link
                    href={`/courses/${course.slug}`}
                    data-track-event="course_card_click"
                    data-track-params={JSON.stringify({ course_id: course.id, action: "view" })}
                    style={{ ...primaryButton, flex: 1 }}
                  >
                    View course
                  </Link>
                  <Link href={`/lead?course=${course.id}&intent=enquire`} data-open-lead style={{ ...secondaryButton, flex: 1 }}>Apply now</Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section style={{ ...pageWidth, paddingTop: 56, paddingBottom: 56 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24 }}>
          <h2 style={sectionTitle}>Browse by stream</h2>
          <Link href="/specializations" style={{ fontSize: 14, fontWeight: 600 }}>All specializations →</Link>
        </div>
        <div className="stream-grid uv-home-factor-grid">
          {streamStats.map((entry) => (
            <Link
              href={`/courses?stream=${encodeURIComponent(entry.stream)}`}
              className="stream-card"
              key={entry.stream}
            >
              <Image className="stream-illustration" src={`/streams/${streamIllustrations[entry.stream]}.webp`} alt="" width={1200} height={800} sizes="(max-width: 640px) 90vw, (max-width: 900px) 45vw, 260px" />
              <strong>{entry.stream}</strong>
              <small>{entry.count} degree{entry.count === 1 ? "" : "s"} · {entry.examples}</small>
              {entry.fromFee ? <small>from {entry.fromFee}</small> : null}
            </Link>
          ))}
        </div>
      </section>

      <section style={{ ...pageWidth, paddingTop: 0, paddingBottom: 56 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
          <h2 style={sectionTitle}>Universities we cover</h2>
          <Link href="/universities" style={{ fontSize: 14, fontWeight: 600 }}>All universities →</Link>
        </div>
        <p style={{ fontSize: 14, color: "#707070", margin: "0 0 24px" }}>
          Three institutions, every program checked against the UGC-DEB entitlement list.
        </p>
        <div className="uv-home-three-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {universities.map((university) => {
            const programCount = courses.filter((course) => course.universityId === university.id).length;
            return (
              <Link
                href={`/universities/${university.slug}`}
                className="uv-card"
                data-track-event="university_card_click"
                data-track-params={JSON.stringify({ university_id: university.id })}
                style={{ display: "block", background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, overflow: "hidden", color: "inherit" }}
                key={university.id}
              >
                <div style={{ height: 140, overflow: "hidden", position: "relative" }}>
                  <Image src={universityMedia[university.id].src} alt={universityMedia[university.id].alt} fill sizes="(max-width: 900px) calc(100vw - 50px), 33vw" style={{ objectFit: "cover" }} />
                  <span style={{ position: "absolute", left: 12, bottom: 12, background: "#fff", borderRadius: 4, padding: "4px 8px", height: 26, display: "inline-flex", alignItems: "center" }}>
                    <Image src={universityMedia[university.id].logo} alt="" width={60} height={18} style={{ height: 16, width: "auto" }} />
                  </span>
                </div>
                <div style={{ padding: 18 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#363634" }}>{universityDisplayName(university.id, university.name)}</div>
                  <div style={{ fontSize: 13, color: "#707070", margin: "4px 0 10px" }}>{university.city} · est. {university.established}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                    {university.approvals.slice(0, 4).map((approval) => (
                      <ApprovalBadge
                        label={approval}
                        style={{ fontSize: 11, fontWeight: 700, color: "#0F5BB8", background: "rgba(79,168,255,0.12)", borderRadius: 999, whiteSpace: "nowrap", padding: "3px 9px" }}
                        key={approval}
                      />
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#555", gap: 12 }}>
                    <span>{programCount} programs</span>
                    <span>{university.placement}% placement</span>
                    <span>{university.avgPackage} avg</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section style={{ ...pageWidth, paddingTop: 0, paddingBottom: 56 }}>
        <h2 style={{ ...sectionTitle, marginBottom: 8 }}>How UnnatiVidya works</h2>
        <p style={{ fontSize: 15, color: "#696868", margin: "0 0 28px" }}>
          Unbiased by design — universities pay us the same, so our advice follows your goals, not commissions.
        </p>
        <div className="uv-home-three-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 28 }}>
          {[
            ["01 · COMPARE", "Compare side by side", "Fees, EMIs, curriculum, approvals and placement records — in one honest table."],
            ["02 · COUNSEL", "Talk to a real counsellor", "A free 1-on-1 call to sanity-check your shortlist against your career plan."],
            ["03 · ENROL", "Enrol with support", "We handle documents, loans and admission follow-ups until your LMS login arrives."],
          ].map(([eyebrow, title, copy]) => (
            <div style={{ borderLeft: "3px solid #544CC8", paddingLeft: 18 }} key={title}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#544CC8", letterSpacing: 0.5, marginBottom: 8 }}>{eyebrow}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#363634", marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 14, color: "#696868", lineHeight: 1.5 }}>{copy}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ ...pageWidth, paddingTop: 0, paddingBottom: 56 }}>
        <div className="uv-home-factor-grid" style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 12 }}>
          {[
            ["30+", "comparison factors"],
            ["Loans", "quick education loan facility"],
            ["Support", "post-admission, till graduation"],
            ["Jobs", "job + internship portal"],
            ["Community", "exclusive learner groups"],
            ["₹0 extra", "lowest-fee guarantee"],
          ].map(([label, copy]) => (
            <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, padding: 14, textAlign: "center" }} key={label}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#544CC8" }}>{label}</div>
              <div style={{ fontSize: 12, color: "#696868", marginTop: 2, lineHeight: 1.4 }}>{copy}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: "#F4F3FC", borderTop: "1px solid #EAEAEA", borderBottom: "1px solid #EAEAEA" }}>
        <div className="uv-home-trust-grid" style={{ ...pageWidth, paddingTop: 40, paddingBottom: 40, display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr", gap: 40, alignItems: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#363634", maxWidth: 200, lineHeight: 1.25 }}>Why learners trust UnnatiVidya</div>
          {[
            ["Unbiased by design", "Every university pays us the same — advice follows your goals, not commissions."],
            ["Approvals verified", "UGC, NAAC and AICTE status re-checked every admission cycle."],
            ["Support till enrolment", "Documents, loans and follow-ups handled until your LMS login arrives."],
          ].map(([title, copy]) => (
            <div key={title}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#544CC8" }}>{title}</div>
              <div style={{ fontSize: 13, color: "#696868", lineHeight: 1.5, marginTop: 4 }}>{copy}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: "#263238" }}>
        <div style={{ ...pageWidth, paddingTop: 48, paddingBottom: 48, display: "grid", gridTemplateColumns: "1fr auto", gap: 32, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#fff" }}>Stuck between two universities?</div>
            <div style={{ fontSize: 15, color: "#B8C4CA", marginTop: 6, maxWidth: 560 }}>
              Put up to three programs side by side — total fee, EMI, approvals, placement rate, average package and specialisation depth, on one screen. The best value in each row is highlighted.
            </div>
          </div>
          <Link href="/compare" style={{ height: 50, lineHeight: "50px", padding: "0 28px", background: "#544CC8", color: "#fff", borderRadius: 4, fontSize: 15, fontWeight: 700 }}>Open compare</Link>
        </div>
      </section>

      <section style={{ ...pageWidth, paddingTop: 56, paddingBottom: 56 }}>
        <h2 style={{ ...sectionTitle, marginBottom: 24 }}>What learners say</h2>
        <div className="uv-home-three-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {[
            ["Priya Sharma", "Online MBA · batch of 2025", "PS", "I compared 4 MBA programs here before picking Manipal Jaipur. The counsellor actually talked me out of the costlier option."],
            ["Arjun Mehta", "Online BCA · working at TCS", "AM", "The EMI breakdown saved me. I knew exactly what I would pay per month before I even spoke to the university."],
            ["Farhan Khan", "Online MCA · batch of 2026", "FK", "AI recommender shortlisted 3 courses in two minutes. Enrolled in Amity MCA the same week."],
          ].map(([name, meta, initials, quote]) => (
            <article style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 22 }} key={name}>
              <div style={{ color: "#FDB515", fontSize: 14, letterSpacing: 2 }}>★★★★★</div>
              <div style={{ fontSize: 14, color: "#555", lineHeight: 1.6, margin: "12px 0 16px" }}>“{quote}”</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#EBF2F6", color: "#555", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#363634" }}>{name}</div>
                  <div style={{ fontSize: 12, color: "#707070" }}>{meta}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 800, margin: "0 auto", padding: "0 24px 64px", width: "100%", boxSizing: "border-box" }}>
        <h2 style={{ ...sectionTitle, marginBottom: 8 }}>Questions we get every day</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
          {homeFaqs.map(([question, answer], index) => (
            <details className="faq-item" name="home-faq" key={question} open={index === 0}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <StickyMobileBar primary={{ label: "Apply now", href: "/lead?intent=enquire", openLead: true }} secondary={{ label: "Browse courses", href: "/courses" }} />
    </>
  )}</PublishedCatalogBoundary>;
}
