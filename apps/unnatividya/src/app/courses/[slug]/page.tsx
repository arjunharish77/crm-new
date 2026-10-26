export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BadgeCheck, Banknote, CalendarDays, CircleCheck, Clock, CreditCard, FilePen, FileUp, GraduationCap, Laptop, type LucideIcon } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { SaveButton } from "@/components/save-button";
import { CompareToggle } from "@/components/compare-toggle";
import { CourseCard } from "@/components/course-card";
import { FaqAccordion } from "@/components/faq-accordion";
import { SectionTabs } from "@/components/section-tabs";
import { CourseEnquiryCard } from "@/components/course-enquiry-card";
import { careerRoleSalary, formatFee } from "@/lib/catalog-format";
import { CONFIRM_WITH_UNIVERSITY, RECOGNITION_STATUS_2026_27, programApplicationFee, programCredits, programFeePlans, programOverview, recognitionSummary } from "@/lib/program-facts";
import { CategoryFeeSelector } from "@/components/category-fee-selector";
import { formatCheckedDate, sourceCheckLine, upcomingIntakes } from "@/lib/source-checks";
import { certificateImagePath, universityMedia } from "@/data/media";
import { publicAssetExists } from "@/lib/asset-exists";
import { buildCourseFaqs } from "@/lib/course-faqs";
import { feeGuideSlugForCourseName, getFeeGuideBySlug } from "@/lib/fee-guides";
import { courseKey } from "@/lib/programmatic-seo";
import { allComparisonPairs } from "@/lib/comparisons";
import { specializationKey } from "@/lib/specializations";
import { getCareerScopeGuideBySlug, getEligibilityGuideBySlug, getUgcApprovalGuideBySlug } from "@/data/guide-content";
import { fitTitle, lakh, withSocial } from "@/lib/page-metadata";
import type { SourcedProgramDetail } from "@/data/catalog";
import { FeeGroupSwitch, GroupEmiPill, GroupEmiText, GroupFeeLabel, GroupFeeText, IndianPlansNote, InternationalFeeNote } from "@/components/fee-group";

function ProgramDetailCard({ title, detail }: { title: string; detail: SourcedProgramDetail }) {
  return <article className="uvcd-detail">
    <h3>{title}</h3>
    <ul>{detail.points.map(point => <li key={point}>{point}</li>)}</ul>
    <p className="uvcd-source">{detail.scope} · <a href={detail.sourceUrl} target="_blank" rel="noopener noreferrer">Official source</a> · checked {formatCheckedDate(detail.checkedAt)}</p>
  </article>;
}

// Admission step icons by what the (university-supplied) step says, not by position.
function admissionIcon(title: string): LucideIcon {
  const text = title.toLowerCase();
  if (/pay|fee/.test(text)) return Banknote;
  if (/document|upload/.test(text)) return FileUp;
  if (/appl|register|form/.test(text)) return FilePen;
  if (/learn|start|lms/.test(text)) return Laptop;
  return BadgeCheck;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const catalog = await getPublishedCatalog();
  const { getCourseBySlug } = catalog;
  const { slug } = await params;
  const course = getCourseBySlug(slug);
  if (!course) return {};
  const title = fitTitle(
    `${course.name}, ${course.university.shortName}: Fees ${lakh(course.fee)}, Eligibility`,
    `${course.name}, ${course.university.shortName}: Fees & Eligibility`,
    `${course.name} from ${course.university.name}`,
    `${course.name} at ${course.university.shortName}`,
  );
  const description = `${course.name} from ${course.university.name}: total fee ${formatFee(course.fee)} over ${course.duration}, EMI from ${course.emi}. Eligibility, recognition status, specialisations and career roles.`;
  return withSocial({
    title,
    description,
    alternates: { canonical: `/courses/${course.slug}` },
    openGraph: { description, images: [universityMedia[course.universityId].src] },
  });
}

export default async function CourseDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const catalog = await getPublishedCatalog();
  const { courseWithUniversity, courses, getCourseBySlug, universityEnrichmentById } = catalog;
  const { slug } = await params;
  const course = getCourseBySlug(slug);
  if (!course) notFound();
  // Similar programs (design rule): the same degree first, then the same stream and level.
  // Catalog order within each group; never ranked by rating.
  const similarCourses = [
    ...courses.filter((candidate) => candidate.id !== course.id && candidate.shortName === course.shortName),
    ...courses.filter((candidate) => candidate.id !== course.id && candidate.shortName !== course.shortName && candidate.stream === course.stream && candidate.level === course.level),
  ].slice(0, 3).map(courseWithUniversity);
  const feeGuide = getFeeGuideBySlug(catalog, feeGuideSlugForCourseName(course.name));
  const key = courseKey(course.name);
  const eligibilityGuide = getEligibilityGuideBySlug(`${key}-eligibility`);
  const careerScopeGuide = getCareerScopeGuideBySlug(`${key}-career-scope`);
  const ugcApprovalGuide = getUgcApprovalGuideBySlug(`${key}-ugc-approval`);
  const comparisonPairs = allComparisonPairs(catalog).filter((pair) => pair.left.id === course.id || pair.right.id === course.id);
  const certificatePath = certificateImagePath(course.id);
  const hasCertificateImage = publicAssetExists(certificatePath);
  const universityEnrichment = universityEnrichmentById[course.universityId];
  const feePlans = programFeePlans(course);
  const nextIntake = upcomingIntakes(course.intakes)[0];
  const recognition = recognitionSummary(course);
  const feeSource = sourceCheckLine(course.feeReview);
  const eligibilitySource = sourceCheckLine(course.eligibilityReview);
  const curriculumSource = sourceCheckLine(course.curriculumReview);
  const semesters = course.duration.startsWith("36") ? 6 : 4;
  const batches = universityEnrichment?.factTiles?.find(([label]) => label === "Batches")?.[1] || "January & July";
  const isEligibilityVerified = course.dataQuality?.eligibility === "verified";
  const isCurriculumVerified = course.dataQuality?.curriculum === "verified";
  const media = universityMedia[course.universityId];
  const fee = formatFee(course.fee);
  const levelName = course.level === "PG" ? "Postgraduate" : "Undergraduate";
  const specCount = course.specializations.length;
  // The sidebar shows listed INR tuition; with published category fees it says whose fee it is.
  // Institution approvals are university-level, never program status (plan §5 row 7), and the
  // blanket "UGC-entitled" label is left out: the program's own result is the recognition line.
  const universityApprovals = course.university.approvals.filter((approval) => !/ugc/i.test(approval)).slice(0, 2);
  const reasons = [
    recognition.recognition?.status === "listed" ? `This program: ${recognition.chip}` : null,
    universityApprovals.length ? `University-level: ${universityApprovals.join(", ")}` : null,
    `${course.university.placement}% placement assistance rate (university-wide)`,
  ].filter((reason): reason is string => Boolean(reason));
  const siteUrl = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";
  const courseJsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: `${course.name} - ${course.university.name}`,
    description: `${course.name} from ${course.university.name}. Duration ${course.duration}, total fee ${formatFee(course.fee)}, online degree.`,
    url: `${siteUrl}/courses/${course.slug}`,
    provider: {
      "@type": "CollegeOrUniversity",
      name: course.university.name,
      url: `${siteUrl}/universities/${course.university.slug}`,
      address: course.university.city,
    },
    educationalCredentialAwarded: course.name,
    timeRequired: course.duration,
    offers: {
      "@type": "Offer",
      price: course.fee,
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      // The course page itself: /lead is blocked in robots.txt (technical SEO review M4).
      url: `${siteUrl}/courses/${course.slug}`,
    },
    // No aggregateRating: see the university page (next-phase plan T1, owner decision 4).
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Courses", item: `${siteUrl}/courses` },
      { "@type": "ListItem", position: 3, name: course.name, item: `${siteUrl}/courses/${course.slug}` },
    ],
  };
  const courseFaqs = buildCourseFaqs(course);
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: courseFaqs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
  const highlights: Array<[string, string]> = [
    ["Mode", "100% online"],
    ["Semesters", `${semesters} semesters`],
    ["Credits", programCredits(course)],
    ["Exams", CONFIRM_WITH_UNIVERSITY],
    ["Application fee", programApplicationFee(course)],
    ["Batches", batches],
    ["Next intake", nextIntake ? `${nextIntake.label} · apply by ${formatCheckedDate(nextIntake.applicationDeadline)}` : "Not yet announced"],
  ];
  const stats: Array<[LucideIcon, React.ReactNode, string]> = [
    [Clock, course.duration, "Duration"],
    [Banknote, <GroupFeeText key="fee" fee={course.fee} categoryFees={course.categoryFees} short />, "Total fee"],
    [CreditCard, <GroupEmiText key="emi" emi={course.emi} />, "EMI from"],
    [GraduationCap, `${course.level} degree`, levelName],
    [Laptop, "100% online", nextIntake ? `Next intake: ${nextIntake.label}` : "Online program"],
  ];
  const admissionSteps = universityEnrichment?.admissionSteps || [
    { title: "Apply online", copy: "Review the university requirements and submit its application." },
    { title: "Upload documents", copy: "Submit the documents requested by the university." },
    { title: "Pay first semester", copy: "Review the university’s payment methods and any financing terms." },
    { title: "Start learning", copy: "The university confirms admission and provides learning-platform access." },
  ];
  const label = `${course.name}, ${course.university.shortName}`;
  // The hero keeps the overview's opening sentence; the full text is in "About this program".
  const overview = programOverview(course);
  const heroAbout = overview.match(/^.*?[.!?](?=\s|$)/)?.[0] || overview;

  return <PublishedCatalogBoundary>{(
    <div className="uvcd-page">
      <JsonLd data={[courseJsonLd, breadcrumbJsonLd, faqJsonLd].filter((item): item is NonNullable<typeof item> => item !== null)} />
      <section className="uvcd-hero" aria-labelledby="course-title">
        <div className="uvcd-hero-inner">
          <nav aria-label="Breadcrumb">
            <ol className="uv-breadcrumb">
              <li><Link href="/">Home</Link></li>
              <li><Link href="/courses">Courses</Link></li>
              <li><span aria-current="page">{course.name}</span></li>
            </ol>
          </nav>
          <div className="uvcd-hero-grid">
            <div>
              <div className="uvcd-uni">
                <span className="uvcd-logo"><Image src={media.logo} alt="" width={40} height={40} /></span>
                <span>
                  <Link href={`/universities/${course.university.slug}`}>{course.university.name}</Link>
                  <small>{course.university.city}</small>
                </span>
              </div>
              <h1 id="course-title" className="uvcd-title">{course.name}</h1>
              <p className="uvcd-meta">
                <span><b><span className="uvcd-star" aria-hidden="true">★</span> {course.rating}</b> ({course.reviews.toLocaleString("en-IN")} reviews)</span>
                <span aria-hidden="true">·</span>
                <span>{levelName} degree</span>
                <span aria-hidden="true">·</span>
                <span>100% online</span>
              </p>
              {/* One program-level recognition chip, never institution badges (UI fix 5, plan §5 row 7).
                  It shows the published, dated UGC-DEB result, or "being re-checked" until one is applied. */}
              <Link href="#sec-recognition" className={`uvcd-recognition${recognition.recognition?.status === "listed" ? " is-listed" : ""}`}>
                {recognition.recognition?.status === "listed" ? <BadgeCheck size={16} aria-hidden="true" /> : <CalendarDays size={16} aria-hidden="true" />}
                <span>{recognition.chip}{"\u00a0"}<span aria-hidden="true">→</span></span>
              </Link>
              <p className="uvcd-about">{heroAbout}</p>
              <div className="uvcd-actions">
                <Link href={`/lead?course=${encodeURIComponent(course.id)}&intent=apply_now`} rel="nofollow" data-open-lead className="btn primary large">Apply now <ArrowRight size={20} aria-hidden="true" /></Link>
                <CompareToggle courseId={course.id} label={label} className="secondary large" />
                <SaveButton courseId={course.id} label={label} variant="outline" size={52} withText />
              </div>
            </div>
            <div className="uvcd-campus">
              <Image src={media.src} alt={media.alt} fill priority sizes="(max-width: 980px) calc(100vw - 32px), 600px" />
            </div>
          </div>
          <dl className="uvcd-stats">
            {stats.map(([Icon, value, name]) => <div key={name}>
              <dt>{name}</dt>
              <dd className="uvcd-stat-icon" aria-hidden="true"><Icon size={22} /></dd>
              <dd>{value}</dd>
            </div>)}
          </dl>
        </div>
      </section>

      <SectionTabs
        label="Course sections"
        items={[
          { label: "Overview", href: "#sec-overview" },
          { label: "Eligibility", href: "#sec-eligibility" },
          { label: "Admission", href: "#sec-admission" },
          { label: "Specialisations", href: "#sec-specialisations" },
          { label: "Study", href: "#sec-curriculum" },
          { label: "Fees & EMI", href: "#sec-fees" },
          { label: "Recognition", href: "#sec-recognition" },
          { label: "Careers", href: "#sec-careers" },
          { label: "FAQ", href: "#sec-faq" },
        ]}
      />

      <div className="uvcd-layout">
        <div className="uvcd-main">
          <div className="uvcd-overview" id="sec-overview">
            <section className="uvcd-card" aria-labelledby="course-about-heading">
              <h2 id="course-about-heading">About this program</h2>
              <p className="uvcd-text">{programOverview(course)}</p>
            </section>
            <section className="uvcd-card" aria-labelledby="course-highlights-heading">
              <h2 id="course-highlights-heading">Key highlights</h2>
              <dl className="uvcd-facts">
                {highlights.map(([name, value]) => <div key={name}><dt>{name}</dt><dd className={value === CONFIRM_WITH_UNIVERSITY ? "is-confirm" : undefined}>{value}</dd></div>)}
              </dl>
            </section>
          </div>

          <section className="uvcd-card" aria-labelledby="course-decision-heading">
            <h2 id="course-decision-heading">Four checks before you apply</h2>
            <p className="uvcd-intro">Start with the published information below, then confirm any open questions with the awarding university for your admission session.</p>
            <div className="uvcd-checks">
              <a href="#sec-eligibility" className="uvcd-check">
                <span className="uvcd-num" aria-hidden="true">1</span>
                <strong>Can you meet the entry rules?</strong>
                <span>{isEligibilityVerified ? "Read the reviewed eligibility and its source." : "The eligibility text still needs a full source review. Confirm your qualification, marks and applicant category."}</span>
              </a>
              <a href="#sec-fees" className="uvcd-check">
                <span className="uvcd-num" aria-hidden="true">2</span>
                <strong>What will you pay?</strong>
                <span>{course.categoryFees ? "Compare the published applicant-category fees, payment terms and charges." : "Start with listed tuition; confirm your applicant category and any additional charges."}</span>
              </a>
              <a href="#sec-curriculum" className="uvcd-check">
                <span className="uvcd-num" aria-hidden="true">3</span>
                <strong>How will you study?</strong>
                <span>{isCurriculumVerified ? "Review the sourced outline, then confirm class and exam arrangements." : "The study outline is illustrative. Confirm classes, assessment and exams with the university."}</span>
              </a>
              <a href="#sec-recognition" className="uvcd-check">
                <span className="uvcd-num" aria-hidden="true">4</span>
                <strong>Is this session listed?</strong>
                <span>{recognition.recognition ? "Check the exact program, listed institution, session and source." : "The current-session check has not been published for this program."}</span>
              </a>
            </div>
          </section>

          <section className="uvcd-card" id="sec-eligibility" aria-labelledby="course-eligibility-heading">
            <div className="uvcd-card-head">
              <h2 id="course-eligibility-heading">Eligibility</h2>
              {/* Status labels (Q13): green only for a source-reviewed record, amber otherwise. */}
              {isEligibilityVerified
                ? <span className="uv-tag uv-tag-success uv-tag-strong">Source verified</span>
                : <span className="uv-tag uv-tag-warning uv-tag-strong">Confirm with the university</span>}
            </div>
            <div className="uvcd-eligibility">
              <span className="uvcd-tile" aria-hidden="true"><GraduationCap size={22} /></span>
              <p>{course.eligibility}</p>
            </div>
            {eligibilitySource ? <p className="uvcd-source">Source: <a href={eligibilitySource.href} target="_blank" rel="noopener noreferrer">{eligibilitySource.host}</a> · checked {eligibilitySource.date}</p> : null}
            <p className="uvcd-tool"><Link className="btn secondary" href={`/tools/eligibility-checker?course=${encodeURIComponent(course.id)}`}>Check my academic profile</Link><span>{course.eligibilityRules ? "Uses this course's reviewed, published criteria." : "A structured rule is still being reviewed; the tool will show what needs confirmation."}</span></p>
          </section>

          <section className="uvcd-card uv-reveal" id="sec-admission" aria-labelledby="course-admission-heading">
            <h2 id="course-admission-heading">Admission process</h2>
            <ol className="uvcd-steps">
              {admissionSteps.map((step, index) => {
                const Icon = admissionIcon(step.title);
                return <li key={step.title}>
                  <span className="uvcd-step-top"><span className="uvcd-num" aria-hidden="true">{index + 1}</span><Icon size={22} aria-hidden="true" /></span>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </li>;
              })}
            </ol>
          </section>

          <section className="uvcd-card uv-reveal" id="sec-specialisations" aria-labelledby="course-specs-heading">
            <h2 id="course-specs-heading">{specCount} specialisation{specCount === 1 ? "" : "s"}</h2>
            <p className="uvcd-intro is-small">Confirm specialisation choices, timing and any fee differences for your admission session.</p>
            <ul className="uvcd-specs">
              {course.specializations.map((spec) => {
                const isGeneral = spec.toLowerCase() === "general";
                return <li key={spec}>
                  {isGeneral
                    ? <span className="uvcd-spec is-static">{spec}</span>
                    : <Link className="uvcd-spec" href={`/specializations/${key}-${specializationKey(spec)}`}>{spec}<ArrowRight size={18} aria-hidden="true" /></Link>}
                </li>;
              })}
            </ul>
            {course.programDetails?.specialization ? <div className="uvcd-detail-after"><ProgramDetailCard title="When you choose a specialization" detail={course.programDetails.specialization} /></div> : null}
          </section>

          <section className="uvcd-card uv-reveal" id="sec-curriculum" aria-labelledby="course-curriculum-heading">
            <h2 id="course-curriculum-heading">{isCurriculumVerified ? "Curriculum" : "Illustrative study areas"}</h2>
            <p className="uvcd-intro">
              {isCurriculumVerified
                ? "Review the subjects below and confirm the latest syllabus for your admission session with the university."
                : "These general study areas are a guide, not the university’s confirmed semester syllabus. We are reviewing the official course outline."}
            </p>
            {curriculumSource && isCurriculumVerified ? <p className="uvcd-source">Source: <a href={curriculumSource.href} target="_blank" rel="noopener noreferrer">{curriculumSource.host}</a> · checked {curriculumSource.date}</p> : null}
            <div className="uvcd-terms">
              {(course.curriculum || []).map((term, index) => (
                <details className="uvcd-term" key={term.term} name="course-curriculum" open={index === 0}>
                  <summary>{isCurriculumVerified ? term.term : `Study area group ${index + 1}`}</summary>
                  <ul>{term.subjects.map((subject) => <li key={subject}>{subject}</li>)}</ul>
                </details>
              ))}
            </div>
          </section>

          <section className="uvcd-card uv-reveal" aria-labelledby="course-learning-heading">
            <h2 id="course-learning-heading">Classes and assessments</h2>
            <p className="uvcd-intro">A curriculum outline does not explain the weekly timetable or how work is assessed. Use the program-specific details below where published, and confirm the current handbook with the university.</p>
            {course.programDetails?.study || course.programDetails?.assessment ? <div className="uvcd-detail-grid">
              {course.programDetails.study ? <ProgramDetailCard title="Learning format" detail={course.programDetails.study} /> : null}
              {course.programDetails.assessment ? <ProgramDetailCard title="Assessment and exams" detail={course.programDetails.assessment} /> : null}
            </div> : null}
            <h3 className="uvcd-h3">Questions to confirm</h3>
            <ul className="uvcd-questions">
              {!course.programDetails?.study ? <li>Which classes are live, which recordings are available, and is attendance required?</li> : <li>What is the current cohort timetable, and which sessions or activities require attendance?</li>}
              {!course.programDetails?.assessment ? <li>How are assignments and end-term exams assessed, and where or how are exams taken?</li> : <li>Do the published assessment rules still apply to your admission session and applicant category?</li>}
              <li>What support is available for missed classes, technical issues and resits?</li>
            </ul>
            <p className="uvcd-source">Ask the university for the current program handbook or assessment rules before paying a fee.</p>
          </section>

          <section className="uvcd-card uv-reveal" id="sec-fees" aria-labelledby="course-fees-heading">
            <div className="uvcd-card-head is-split">
              <h2 id="course-fees-heading">Fees &amp; EMI options</h2>
              <Link href={`/tools/emi-calculator?course=${encodeURIComponent(course.id)}`} className="uvcd-link">Open EMI calculator →</Link>
            </div>
            <FeeGroupSwitch id="course-fee-group" className="uvcd-fee-group" />
            <InternationalFeeNote categoryFees={course.categoryFees} />
            {course.categoryFees ? <CategoryFeeSelector fees={course.categoryFees} courseId={course.id} /> : feeSource ? <p className="uvcd-source">Fee source: <a href={feeSource.href} target="_blank" rel="noopener noreferrer">{feeSource.host}</a> · checked {feeSource.date}</p> : null}
            {feePlans.length ? <IndianPlansNote /> : null}
            {feePlans.length ? <div className="uvcd-plans">
              {feePlans.map((row, index) => (
                <article className="uvcd-plan" key={`${row[0]}-${index}`}>
                  <h3>{row[0]}</h3>
                  <dl>
                    <div><dt>You pay</dt><dd className="uvcd-plan-value">{row[1]}</dd></div>
                    <div><dt>Payment terms</dt><dd>{row[2]}</dd></div>
                  </dl>
                </article>
              ))}
            </div> : <p className="uvcd-text">Payment plans are not listed. Confirm available options with the university.</p>}
            <div className="uvcd-payable">
              <h3>Check the total payable</h3>
              <dl>
                <div><dt>Tuition to check</dt><dd>{course.categoryFees ? "Use your applicant-category amount selected above" : `${fee} (listed INR tuition)`}</dd></div>
                <div><dt>Application fee</dt><dd>{programApplicationFee(course)}</dd></div>
                <div><dt>Other mandatory charges</dt><dd>{course.programDetails?.additionalCharges ? "See the sourced exclusions below; confirm the current amounts with the university." : "Exam, resit, convocation, taxes or processing: confirm what applies and whether it is included."}</dd></div>
              </dl>
            </div>
            {course.programDetails?.additionalCharges ? <div className="uvcd-detail-after"><ProgramDetailCard title="Possible charges beyond tuition" detail={course.programDetails.additionalCharges} /></div> : null}
            <p className="uvcd-note">Payment plans and scholarships depend on current university terms and eligibility. Confirm the total payable and financing charges before applying.</p>
            <div className="uvcd-links">
              {!course.categoryFees ? <Link href={`/tools/total-cost?course=${encodeURIComponent(course.id)}`} className="uvcd-link">Plan total cost for your fee category →</Link> : null}
              {feeGuide ? (
                <Link href={`/online-degree-guides/${feeGuide.slug}`} className="uvcd-link">
                  {feeGuide.isComparison
                    ? `See ${course.name} fees compared across ${feeGuide.courses.length} universities →`
                    : `See the full ${course.name} fee & scholarship guide →`}
                </Link>
              ) : null}
              {eligibilityGuide ? <Link href={`/online-degree-guides/${eligibilityGuide.slug}`} className="uvcd-link">{course.name} eligibility across universities →</Link> : null}
            </div>
          </section>

          <section className="uvcd-card uv-reveal" id="sec-recognition" aria-labelledby="course-recognition-heading">
            <div className="uvcd-card-head">
              <h2 id="course-recognition-heading">Recognition</h2>
              {!recognition.recognition ? <span className="uv-tag uv-tag-neutral uv-tag-strong">Being re-checked</span> : null}
            </div>
            {recognition.recognition ? (
              <>
                <p className="uvcd-text">
                  {recognition.recognition.status === "listed"
                    ? `This program is on the ${recognition.recognition.listName}.`
                    : recognition.recognition.note}
                </p>
                {recognition.recognition.status === "listed" && recognition.recognition.note ? <p className="uvcd-caveat">{recognition.recognition.note}</p> : null}
                <dl className="uvcd-recognition-facts">
                  <div><dt>Listed under</dt><dd>{recognition.recognition.listedUnder}</dd></div>
                  <div><dt>Programme as printed</dt><dd>{recognition.recognition.listedProgramme}</dd></div>
                </dl>
                <p className="uvcd-source">Source: <a href={recognition.recognition.sourceUrl} target="_blank" rel="noopener noreferrer">official UGC-DEB list ({recognition.recognition.academicYear})</a> · checked {formatCheckedDate(recognition.recognition.checkedAt)}</p>
                <p className="uvcd-note">Entitlement depends on the university continuing to meet UGC&apos;s conditions. Check the program at deb.ugc.ac.in before you enrol.</p>
              </>
            ) : (
              <p className="uvcd-text">{RECOGNITION_STATUS_2026_27}</p>
            )}
            <div className="uvcd-links">
              <Link href={`/universities/${course.university.slug}#sec-rankings`} className="uvcd-link">{course.university.shortName} university-level approvals →</Link>
            </div>
          </section>

          <section className="uvcd-card uv-reveal" id="sec-careers" aria-labelledby="course-careers-heading">
            <h2 id="course-careers-heading">Placements &amp; career outcomes</h2>
            <p className="uvcd-note is-top">University-wide figures reported by {course.university.shortName}, not specific to this program.</p>
            <dl className="uvcd-outcomes">
              <div><dt>placement assistance rate (university-wide)</dt><dd>{course.university.placement}%</dd></div>
              <div><dt>average package (university-wide)</dt><dd>{course.university.avgPackage}</dd></div>
              <div><dt>hiring partners (university-wide)</dt><dd>{course.university.partners}+</dd></div>
            </dl>
            <h3 className="uvcd-h3">Roles this degree can lead to</h3>
            <p className="uvcd-note is-top">Salary bands are indicative industry ranges, not verified for this program or university.</p>
            <ul className="uvcd-roles">
              {course.careerRoles.map((role) => <li key={role}><span>{role}</span><b>{careerRoleSalary[role] || "Role-fit varies"}</b></li>)}
            </ul>
            <p className="uvcd-note">Placement assistance, not a guaranteed offer — as stated on the university&apos;s own pages.</p>
            {careerScopeGuide ? <div className="uvcd-links"><Link href={`/online-degree-guides/${careerScopeGuide.slug}`} className="uvcd-link">Full {course.name} career scope, by university →</Link></div> : null}
          </section>

          <section className="uvcd-card uvcd-certificate uv-reveal" id="sec-certificate" aria-labelledby="course-certificate-heading">
            <div>
              <h2 id="course-certificate-heading">Sample degree certificate</h2>
              <p className="uvcd-text">Any sample shown is for reference. Confirm the current certificate wording and program recognition with the university. Requirements for employment, further study and overseas evaluation depend on the receiving organisation.</p>
            </div>
            {hasCertificateImage ? (
              <div className="uvcd-certificate-media">
                <Image src={certificatePath} alt={`${course.name} sample degree certificate`} fill sizes="(max-width: 640px) 90vw, 340px" />
              </div>
            ) : (
              <div className="uvcd-certificate-media is-empty">Sample certificate image is not available</div>
            )}
          </section>

          {ugcApprovalGuide || comparisonPairs.length ? (
            <section className="uvcd-card uv-reveal" id="sec-related-guides" aria-labelledby="course-related-heading">
              <h2 id="course-related-heading">Related guides</h2>
              <ul className="uvcd-related">
                {ugcApprovalGuide ? <li><Link href={`/online-degree-guides/${ugcApprovalGuide.slug}`} className="uvcd-link">Is {course.name} UGC approved? →</Link></li> : null}
                {comparisonPairs.map((pair) => {
                  const other = pair.left.id === course.id ? pair.right : pair.left;
                  return <li key={`${pair.key}/${pair.slug}`}><Link href={`/compare/${pair.key}/${pair.slug}`} className="uvcd-link">{course.name}: {course.university.shortName} vs {other.university.shortName} →</Link></li>;
                })}
              </ul>
            </section>
          ) : null}

          {/* The two named reviews that used to sit here were the same on all 30 courses and can't be
              tied to a program, so they moved to the claims register (owner decision 5). */}
        </div>

        <CourseEnquiryCard
          courseId={course.id}
          feeLabel={<>Total tuition, <GroupFeeLabel /></>}
          fee={<GroupFeeText fee={course.fee} categoryFees={course.categoryFees} />}
          emi={<GroupEmiPill emi={course.emi} className="uvcd-emi-pill" />}
          universityShortName={course.university.shortName}
          reasons={reasons}
        />
      </div>

      <div className="uvcd-wide">
        {similarCourses.length ? (
          <section className="uvcd-similar uv-reveal" aria-labelledby="course-similar-heading">
            <h2 id="course-similar-heading" className="uv-h2 is-inner">Similar programs to consider</h2>
            <div className="uv-card-grid">
              {similarCourses.map((candidate) => <CourseCard key={candidate.id} course={candidate} trackSource="course_similar" />)}
            </div>
          </section>
        ) : null}

        <div className="uvcd-faq uv-reveal">
          <FaqAccordion items={courseFaqs} name="course-faq" subtitle={`Quick answers about the ${course.name} at ${course.university.shortName}.`} />
        </div>
      </div>

      {/* Mobile bar (Q16): fee and EMI with Apply now, below 860px only. */}
      <div className="uv-mobile-bar uvcd-mobile-bar" role="region" aria-label="Fee and apply">
        <p><b><GroupFeeText fee={course.fee} categoryFees={course.categoryFees} short /></b><span><GroupEmiPill emi={course.emi} /></span></p>
        <Link href={`/lead?course=${encodeURIComponent(course.id)}&intent=enquire`} rel="nofollow" data-open-lead className="btn primary">Apply now</Link>
      </div>
    </div>
  )}</PublishedCatalogBoundary>;
}
