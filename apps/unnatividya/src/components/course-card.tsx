import Image from "next/image";
import Link from "next/link";
import { BookOpenText, BriefcaseBusiness, Landmark, Monitor, type LucideIcon } from "lucide-react";
import { CompareToggle } from "@/components/compare-toggle";
import { GroupEmiText, GroupFeeText } from "@/components/fee-group";
import { SaveButton } from "@/components/save-button";
import { universityMedia } from "@/data/media";
import type { courseWithUniversity } from "@/data/catalog";

type CardCourse = ReturnType<typeof courseWithUniversity>;

// Stream icons (design uv-data.js streamIcon, mapped to lucide in plan Appendix A §0.5).
export const STREAM_ICONS: Record<string, LucideIcon> = {
  Management: BriefcaseBusiness,
  "IT & Computers": Monitor,
  Commerce: Landmark,
  "Arts & Humanities": BookOpenText,
};

// Short recognition label from the published 2026-27 result (plan §5 row 7): never a blanket
// "UGC-entitled". Without a published result the card says it is being re-checked.
function recognitionLabel(course: CardCourse) {
  const r = course.recognition;
  if (r?.status === "listed") return { text: `UGC-DEB ${r.academicYear} ✓`, tone: "success" as const };
  if (r) return { text: "Confirm awarding university", tone: "warning" as const };
  return { text: "Recognition re-check", tone: "neutral" as const };
}

// The shared program card (design UVCard; UI redesign Q5/Q6): View details + Compare, no Apply now.
export function CourseCard({ course, headingLevel = 3, trackSource }: { course: CardCourse; headingLevel?: 2 | 3; trackSource?: string }) {
  const Icon = STREAM_ICONS[course.stream] || BriefcaseBusiness;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const specs = course.specializations.filter(spec => spec.toLowerCase() !== "general");
  const label = `${course.name}, ${course.university.shortName}`;
  const recognition = recognitionLabel(course);
  const href = `/courses/${course.slug}`;
  return <article className="uv-card" aria-labelledby={`card-${course.id}`}>
    <div className="uv-card-top">
      <span className="uv-icon-tile" aria-hidden="true"><Icon size={24} /></span>
      <div className="uv-card-id">
        <Heading id={`card-${course.id}`} className="uv-card-title">
          <Link href={href} data-track-event="course_card_click" data-track-params={JSON.stringify({ course_id: course.id, source: trackSource || "card" })}>{course.name}</Link>
        </Heading>
        <p className="uv-card-uni">
          <Image src={universityMedia[course.universityId]?.logo || "/brand/favicon-32x32.png"} alt="" width={16} height={16} />
          {course.university.name}
        </p>
      </div>
      <SaveButton courseId={course.id} label={label} />
    </div>
    <div className="uv-card-tags">
      <span className="uv-level">{course.level}</span>
      <span className={`uv-tag uv-tag-${recognition.tone}`}>{recognition.text}</span>
      <span className="uv-card-rating"><span aria-hidden="true">★</span> {course.rating} <span className="uv-card-reviews">({course.reviews.toLocaleString("en-IN")})</span></span>
    </div>
    <dl className="uv-card-stats">
      <div><dt>Duration</dt><dd>{course.duration.replace(/\s*months?$/i, " mo")}</dd></div>
      <div><dt>Total tuition</dt><dd><GroupFeeText fee={course.fee} categoryFees={course.categoryFees} short /></dd></div>
      <div><dt>EMI from</dt><dd><GroupEmiText emi={course.emi} /></dd></div>
    </dl>
    {specs.length ? <Link className="uv-card-specs" href={`${href}#sec-specialisations`}>{specs.length} specialisation{specs.length > 1 ? "s" : ""}</Link> : <span className="uv-card-specs is-muted">General program</span>}
    <div className="uv-card-actions">
      <Link href={href} className="btn primary">View details</Link>
      <CompareToggle courseId={course.id} label={label} className="secondary" />
    </div>
  </article>;
}
