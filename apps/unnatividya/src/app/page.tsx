export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import Image from "next/image";
import { approvalIconWidth } from "@/lib/approval-icons";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { CourseCard } from "@/components/course-card";
import { JsonLd } from "@/components/json-ld";
import { formatFee } from "@/lib/catalog-format";
import { learningMedia, recommenderPreviewMedia, universityMedia } from "@/data/media";
import { withSocial } from "@/lib/page-metadata";
import { FeeGroupSwitch, GroupEmiText, GroupFeeText } from "@/components/fee-group";

// Home from the design handoff (Home.dc.html, navy hero, no marquee) with the owner decisions in
// docs/UI_REDESIGN_PLAN_2026-10.md §10. Every figure comes from the published catalog.
export const metadata: Metadata = withSocial({
  title: { absolute: "Unnati Vidya | Compare UGC-Approved Online Degrees" },
  description: "Compare UGC-entitled online degrees from Manipal University Jaipur, Sikkim Manipal University and Amity Online: fees for Indian, NRI and international applicants, eligibility, recognition status and specialisations.",
  alternates: { canonical: "/" },
});

// Plain-text answers for the FAQPage structured data; the rendered answers add links.
const homeFaqs: Array<[string, string]> = [
  ["Are online degrees valid for government jobs?", "Yes. UGC-entitled online degrees are legally equivalent to on-campus degrees for government jobs, PSU recruitment and higher studies."],
  ["Is counselling really free?", "Yes. Counselling is free for learners, and Unnati Vidya adds no charge on top of the university fee."],
  ["Can I pay via EMI?", "Every listed program offers no-cost EMI through education loan partners, plus semester-wise payment options."],
  ["How do you verify fees and approvals?", "We compare fees, recognition and admission details with each university's own published pages and the UGC-DEB lists, show the date we last checked each fact, and flag anything we can't confirm. See how we verify."],
  ["Will my certificate say \"online\"?", "No. A UGC-entitled online degree carries the same certificate as the on-campus program — there is no \"online\" marking that affects how employers or government bodies treat it."],
];

const STREAMS: Array<{ name: string; image: string }> = [
  { name: "Management", image: "management" },
  { name: "IT & Computers", image: "it-computer-applications" },
  { name: "Commerce", image: "commerce-finance" },
  { name: "Arts & Humanities", image: "arts-humanities" },
];

// Owner-confirmed points only (UI redesign Q8; claims register).
const PERKS: Array<[string, string]> = [
  ["No hidden charges", "Unnati Vidya adds nothing to the university fee"],
  ["Approvals you can check", "Official UGC-DEB links and checked dates"],
  ["Support till enrolment", "Documents and follow-ups until your LMS login"],
  ["Loans", "Help with education-loan options"],
  ["₹0 extra", "lowest-fee guarantee"],
  ["10k+", "learners guided"],
];

const TESTIMONIALS: Array<[string, string, string, string]> = [
  ["Priya Sharma", "Online MBA · batch of 2025", "PS", "I compared 4 MBA programs here before picking Manipal Jaipur. The counsellor actually talked me out of the costlier option."],
  ["Arjun Mehta", "Online BCA · working at TCS", "AM", "The EMI breakdown saved me. I knew exactly what I would pay per month before I even spoke to the university."],
  ["Farhan Khan", "Online MCA · batch of 2026", "FK", "AI recommender shortlisted 3 courses in two minutes. Enrolled in Amity MCA the same week."],
];

export default async function HomePage() {
  const catalog = await getPublishedCatalog();
  const { courses, courseWithUniversity, universities } = catalog;
  const popular = ["mba-muj", "bca-muj", "mca-muj", "mba-smu", "bcom-muj", "msc-data-science-amity"]
    .map(id => courses.find(course => course.id === id))
    .filter((course): course is (typeof courses)[number] => Boolean(course))
    .map(courseWithUniversity);
  const mbas = courses.filter(course => course.shortName === "MBA").map(courseWithUniversity).sort((a, b) => a.fee - b.fee);
  const cheapestMba = mbas[0];
  const topPackage = [...universities].sort((a, b) => Number(b.avgPackage.replace(/[^\d.]/g, "")) - Number(a.avgPackage.replace(/[^\d.]/g, "")))[0];
  const streams = STREAMS.map(stream => {
    const list = courses.filter(course => course.stream === stream.name);
    return { ...stream, count: list.length, examples: [...new Set(list.map(course => course.shortName))].slice(0, 3).join(", "), from: list.length ? formatFee(Math.min(...list.map(course => course.fee))) : null };
  });
  const teaser = ["muj", "smu", "amity"].map(id => mbas.find(course => course.universityId === id)).filter((course): course is NonNullable<typeof course> => Boolean(course));
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: homeFaqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
  };

  return <PublishedCatalogBoundary>{(
    <div className="uv-home">
      <JsonLd data={faqJsonLd} />

      {/* Navy hero (Home.dc.html:20-69) */}
      <section className="uv-hero" aria-labelledby="home-title">
        <div className="uv-hero-grid">
          <div>
            <p className="uv-hero-eyebrow">{courses.length} programs · {universities.length} universities · free counselling</p>
            <h1 id="home-title" className="uv-hero-title">Find an online degree that fits <span>you.</span></h1>
            <p className="uv-hero-lede">Explore Manipal University Jaipur, Sikkim Manipal University and Amity Online. Compare tuition, entry requirements and study options.</p>
            <form className="uv-hero-search" action="/courses" method="get" role="search" aria-label="Find a course">
              {/* The wrapping labels keep the whole field clickable; aria-labelledby keeps each accessible
                  name to the visible caption (a select inside its label would add its chosen option). */}
              <label className="uv-hero-field is-text">
                <span id="hero-q-label">Course or keyword</span>
                <input name="q" type="search" aria-labelledby="hero-q-label" placeholder="e.g. Online MBA" maxLength={160} />
              </label>
              <label className="uv-hero-field">
                <span id="hero-level-label">Degree level</span>
                <select name="level" defaultValue="" aria-labelledby="hero-level-label">
                  <option value="">Any level</option>
                  <option value="UG">Undergraduate</option>
                  <option value="PG">Postgraduate</option>
                </select>
              </label>
              <label className="uv-hero-field">
                <span id="hero-stream-label">Stream</span>
                <select name="stream" defaultValue="" aria-labelledby="hero-stream-label">
                  <option value="">Any stream</option>
                  {STREAMS.map(stream => <option key={stream.name} value={stream.name}>{stream.name}</option>)}
                </select>
              </label>
              <button type="submit" className="btn primary uv-hero-submit" data-track-event="course_search" data-track-params={JSON.stringify({ source: "homepage_hero" })}>
                Show programs <ArrowRight size={18} aria-hidden="true" />
              </button>
            </form>
            <div className="uv-hero-popular">
              <span>Popular:</span>
              {[["Online MBA", "MBA"], ["Online BCA", "BCA"], ["Online MCA", "MCA"], ["Online B.Com", "B.Com"]].map(([label, degree]) => (
                <Link key={degree} href={`/courses?degree=${encodeURIComponent(degree)}`}>{label}</Link>
              ))}
            </div>
          </div>
          <div className="uv-hero-visual">
            <Image src={learningMedia.src} alt={learningMedia.alt} width={1200} height={960} sizes="(max-width: 1050px) calc(100vw - 40px), 560px" priority className="uv-hero-image" />
            {cheapestMba ? <div className="uv-hero-fact is-light">
              <span>Lowest listed MBA tuition (Indian applicants)</span>
              <strong>{formatFee(cheapestMba.fee)}</strong>
              <small>{cheapestMba.university.shortName} · EMI {cheapestMba.emi}</small>
            </div> : null}
            {topPackage ? <div className="uv-hero-fact is-primary">
              <span>Average package</span>
              <strong>{topPackage.avgPackage}</strong>
              <small>{topPackage.shortName}, university-wide</small>
            </div> : null}
          </div>
        </div>
        <div className="uv-hero-approvals-row">
          <div className="uv-hero-approvals">
            <span className="uv-hero-approvals-label">Approvals that matter</span>
            <ul aria-label="University approvals and memberships">
              {[["ugc", "UGC"], ["naac", "NAAC"], ["aicte", "AICTE"], ["wes", "WES"], ["aiu", "AIU"]].map(([slug, label]) => (
                <li key={slug}><Image src={`/approvals/${slug}.svg`} alt={label} width={approvalIconWidth(`/approvals/${slug}.svg`, 24)} height={24} /></li>
              ))}
            </ul>
            <Link href="/how-we-verify">How we verify →</Link>
          </div>
        </div>
      </section>

      <div className="uv-shell">
        {/* Popular online degrees */}
        <section className="uv-section" aria-labelledby="popular-title">
          <div className="uv-section-head">
            <div>
              <h2 id="popular-title" className="uv-h2">Popular online degrees</h2>
              <p className="uv-section-sub">Compare listed tuition and duration, then open a course for its requirements and current fee details.</p>
            </div>
            <Link href="/courses" className="uv-section-link">Browse all {courses.length} <span aria-hidden="true">→</span></Link>
          </div>
          <div className="uv-card-grid is-wide">
            {popular.map(course => <CourseCard key={course.id} course={course} trackSource="home_popular" />)}
          </div>
        </section>

        {/* Browse by stream */}
        <section className="uv-section uv-reveal" aria-labelledby="streams-title">
          <div className="uv-section-head">
            <h2 id="streams-title" className="uv-h2">Browse by stream</h2>
            <Link href="/specializations" className="uv-section-link">All specializations <span aria-hidden="true">→</span></Link>
          </div>
          <div className="uv-stream-grid">
            {streams.map(stream => <Link key={stream.name} href={`/courses?stream=${encodeURIComponent(stream.name)}`} className="uv-stream-tile">
              <Image src={`/streams/${stream.image}.webp`} alt="" fill sizes="(max-width: 640px) 100vw, 300px" />
              <span className="uv-stream-body">
                <strong>{stream.name}</strong>
                <small>{stream.count} program{stream.count === 1 ? "" : "s"} · {stream.examples}</small>
                <span className="uv-stream-foot">
                  {stream.from ? <span>from <b>{stream.from}</b></span> : <span />}
                  <span className="uv-stream-arrow" aria-hidden="true"><ArrowRight size={16} /></span>
                </span>
              </span>
            </Link>)}
          </div>
        </section>

        {/* Course matching (Q7: the current preview image instead of sample scores) */}
        <section className="uv-section uv-reveal" aria-labelledby="matching-title">
          <div className="uv-navy-panel uv-matching">
            <div>
              <p className="uv-matching-eyebrow">Course matching</p>
              <h2 id="matching-title" className="uv-matching-title">Start with your goals and budget.</h2>
              <p className="uv-matching-copy">Explore an initial shortlist based on your preferences. Check the course’s entry requirements and confirm eligibility with the university before applying.</p>
              <div className="uv-matching-actions">
                <Link href="/recommender" className="btn on-navy large">Get my shortlist <ArrowRight size={18} aria-hidden="true" /></Link>
                <Link href="/courses" className="btn outline-on-navy large">Compare manually</Link>
              </div>
              <p className="uv-matching-note">Takes about two minutes · no sign-up to see results</p>
            </div>
            <div>
              <div className="uv-matching-media">
                <Image src={recommenderPreviewMedia.src} alt={recommenderPreviewMedia.alt} fill sizes="(max-width: 900px) calc(100vw - 80px), 520px" />
              </div>
              <p className="uv-matching-disclaimer">Preference-based suggestions are a starting point, not an admission decision.</p>
            </div>
          </div>
        </section>

        {/* Universities we cover */}
        <section className="uv-section uv-reveal" aria-labelledby="unis-title">
          <div className="uv-section-head">
            <div>
              <h2 id="unis-title" className="uv-h2">Universities we cover</h2>
              <p className="uv-section-sub">Three universities. Each program&apos;s 2026-27 UGC-DEB status is shown on its course page.</p>
            </div>
            <Link href="/universities" className="uv-section-link">All universities <span aria-hidden="true">→</span></Link>
          </div>
          <div className="uv-card-grid is-wide">
            {[...universities].sort((a, b) => ["muj", "smu", "amity"].indexOf(a.id) - ["muj", "smu", "amity"].indexOf(b.id)).map(university => {
              const media = universityMedia[university.id];
              const programs = courses.filter(course => course.universityId === university.id).length;
              return <Link key={university.id} href={`/universities/${university.slug}`} className="uv-uni-card" data-track-event="university_card_click" data-track-params={JSON.stringify({ university_id: university.id })}>
                <span className="uv-uni-media">
                  {media ? <Image src={media.src} alt="" fill sizes="(max-width: 760px) 100vw, 400px" /> : null}
                  {media ? <span className="uv-uni-logo"><Image src={media.logo} alt="" width={40} height={40} /></span> : null}
                </span>
                <span className="uv-uni-body">
                  <h3>{university.id === "amity" ? "Amity University Online" : university.name}</h3>
                  <span className="uv-uni-meta">{university.city} · est. {university.established}</span>
                  <span className="uv-uni-tags">{university.approvals.slice(0, 3).map(approval => <span key={approval} className="uv-tag uv-tag-neutral">{approval}</span>)}</span>
                  <span className="uv-uni-stats">
                    <span><b>{programs}</b><small>programs</small></span>
                    <span><b>{university.placement}%</b><small>placement, university-wide</small></span>
                    <span><b>{university.avgPackage}</b><small>avg package, university-wide</small></span>
                  </span>
                </span>
              </Link>;
            })}
          </div>
        </section>

        {/* Compare teaser: real MBA fees, no "best" highlighting (plan §5 row 4) */}
        {teaser.length > 1 ? <section className="uv-section uv-reveal" aria-labelledby="compare-title">
          <div className="uv-lavender-panel uv-teaser">
            <div>
              <h2 id="compare-title" className="uv-h2">Stuck between two universities?</h2>
              <p className="uv-section-sub">Put up to three programs side by side: total fee, EMI, eligibility, recognition and specialisations. Verify your email to see the full comparison.</p>
              <Link href="/compare" className="btn primary large uv-teaser-cta">Open compare <ArrowRight size={18} aria-hidden="true" /></Link>
            </div>
            <div className="uv-teaser-table">
              <FeeGroupSwitch id="home-fee-group" className="uv-home-fee-group" />
              <div className="uv-table-region" role="region" aria-label="Online MBA fees by university" tabIndex={0}>
                <table className="uv-table">
                  <caption className="sr-only">Online MBA listed fees by university</caption>
                  <thead><tr><th scope="col">Online MBA</th>{teaser.map(course => <th scope="col" key={course.id}>{course.university.shortName}</th>)}</tr></thead>
                  <tbody>
                    <tr><th scope="row">Total fee</th>{teaser.map(course => <td key={course.id}><GroupFeeText fee={course.fee} categoryFees={course.categoryFees} short /></td>)}</tr>
                    <tr><th scope="row">EMI from</th>{teaser.map(course => <td key={course.id}><GroupEmiText emi={course.emi} /></td>)}</tr>
                    <tr><th scope="row">Duration</th>{teaser.map(course => <td key={course.id}>{course.duration}</td>)}</tr>
                    <tr><th scope="row">Specialisations</th>{teaser.map(course => <td key={course.id}>{course.specializations.length}</td>)}</tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section> : null}

        {/* How Unnati Vidya works + perks (Q8) */}
        <section className="uv-section uv-reveal" aria-labelledby="how-title">
          <h2 id="how-title" className="uv-h2">How Unnati Vidya works</h2>
          <p className="uv-section-sub">No hidden charges: counselling is free, and our advice follows your goals.</p>
          <ol className="uv-steps">
            {[
              ["01 · Compare", "Compare side by side", "Fees, EMIs, eligibility, recognition and curriculum — in one table."],
              ["02 · Counsel", "Talk to a real counsellor", "A free 1-on-1 call to sanity-check your shortlist against your career plan."],
              ["03 · Enrol", "Enrol with support", "We handle documents, loans and admission follow-ups until your LMS login arrives."],
            ].map(([eyebrow, title, copy]) => <li key={title}><span>{eyebrow}</span><h3>{title}</h3><p>{copy}</p></li>)}
          </ol>
          <dl className="uv-perks">
            {PERKS.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}
          </dl>
        </section>

        {/* What learners say (owner-retained testimonials, unchanged) */}
        <section className="uv-section uv-reveal" aria-labelledby="learners-title">
          <h2 id="learners-title" className="uv-h2 uv-mb-28">What learners say</h2>
          <div className="uv-quotes">
            {TESTIMONIALS.map(([name, meta, initials, quote]) => <figure key={name} className="uv-quote">
              <span className="uv-quote-stars" aria-hidden="true">★★★★★</span>
              <blockquote>“{quote}”</blockquote>
              <figcaption><span className="uv-avatar" aria-hidden="true">{initials}</span><span><b>{name}</b><small>{meta}</small></span></figcaption>
            </figure>)}
          </div>
        </section>

        {/* FAQ, Home layout (Home.dc.html:201-215), no phone */}
        <section className="uv-section uv-home-faq uv-reveal" aria-labelledby="home-faq-title">
          <div>
            <h2 id="home-faq-title" className="uv-h2">Questions we get every day</h2>
            <p className="uv-section-sub">Still unsure? A counsellor can walk you through it — free.</p>
            <div className="uv-home-faq-actions">
              <Link href="/lead?intent=home-faq" rel="nofollow" data-open-lead className="btn primary">Apply now</Link>
              <Link href="/how-we-verify" className="btn secondary">How we verify</Link>
            </div>
          </div>
          <div className="uv-home-faq-list">
            {homeFaqs.map(([question, answer]) => <details key={question} name="home-faq" className="uv-home-faq-item">
              <summary>{question}<span aria-hidden="true" /></summary>
              <p>{question.startsWith("How do you verify") ? <>{answer.replace(" See how we verify.", " ")}<Link href="/how-we-verify">See how we verify</Link>.</> : answer}</p>
            </details>)}
          </div>
        </section>
      </div>

      {/* Mobile action bar (Q16) */}
      <div className="uv-mobile-bar" role="region" aria-label="Quick actions">
        <Link href="/courses" className="btn secondary uv-flex-1">Browse courses</Link>
        <Link href="/lead?intent=enquire" rel="nofollow" data-open-lead className="btn primary uv-flex-1">Apply now</Link>
      </div>
    </div>
  )}</PublishedCatalogBoundary>;
}
