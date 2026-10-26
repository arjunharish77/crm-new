import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Banknote, BriefcaseBusiness, Building2, Clock, CreditCard, Globe, GraduationCap, LayoutGrid, Star, TrendingUp, UserRound, type LucideIcon } from "lucide-react";
import { SaveButton } from "@/components/save-button";
import { universityMedia } from "@/data/media";
import { buildComparisonRows, type EnrichedCourse } from "@/lib/comparisons";

// Row icons (design Compare rows use schedule/person/category/work). Decorative only.
const ROW_ICONS: Record<string, LucideIcon> = {
  "Total fee": Banknote,
  "Fee outside India": Globe,
  "EMI from": CreditCard,
  Duration: Clock,
  Level: GraduationCap,
  Rating: Star,
  "University approvals": BadgeCheck,
  "Placement rate (university-wide)": BriefcaseBusiness,
  "Average package (university-wide)": TrendingUp,
  "Hiring partners (university-wide)": Building2,
  Specialisations: LayoutGrid,
  Eligibility: UserRound,
};

const LONG_VALUE = 42;

function Who({ course }: { course: EnrichedCourse }) {
  return <span className="uv-cmp-who">
    <Image src={universityMedia[course.universityId]?.logo || "/brand/favicon-32x32.png"} alt="" width={20} height={20} />
    {course.university.shortName} · {course.shortName}
  </span>;
}

// The comparison table shared by the gated /compare tool and the public editorial pages
// (design Compare table, plan B §3.3 items 4–5). A real <table>: sticky column headers on desktop,
// one card per feature below 860px. Rows come from buildComparisonRows unchanged, with no
// best/lowest highlighting (plan §5 row 4). Rows with identical values carry data-same for the
// CSS-only "Show differences only" toggle.
export function ComparisonTable({ courses, caption, regionLabel, nextSteps = false }: {
  courses: EnrichedCourse[];
  caption: string;
  regionLabel: string;
  nextSteps?: boolean;
}) {
  const rows = buildComparisonRows(courses);
  return <div className="comparison-diff-scope uv-cmp-results">
    <div className="uv-cmp-toolbar">
      <label className="comparison-diff-toggle uv-cmp-diff"><input type="checkbox" /> Show differences only</label>
      <p className="uv-cmp-note">Listed catalog details. Confirm current fees and eligibility on each course page.</p>
    </div>
    <div className="uv-cmp-table-wrap" role="region" aria-label={regionLabel}>
      <table className="uv-cmp-table" data-cols={courses.length}>
        <caption className="sr-only">{caption}</caption>
        <colgroup><col className="uv-cmp-col-label" />{courses.map(course => <col key={course.id} />)}</colgroup>
        <thead>
          <tr>
            <th scope="col" className="uv-cmp-corner">Features</th>
            {courses.map(course => <th scope="col" key={course.id}>
              <span className="uv-cmp-colhead">
                <span className="uv-cmp-logo"><Image src={universityMedia[course.universityId]?.logo || "/brand/favicon-32x32.png"} alt="" width={34} height={34} /></span>
                <span className="uv-cmp-colname"><strong>{course.university.name}</strong><small>{course.name}</small></span>
              </span>
              <span className="uv-cmp-col-actions">
                <Link href={`/courses/${course.slug}`} className="btn primary">View program <ArrowRight size={16} aria-hidden="true" /></Link>
                <SaveButton courseId={course.id} label={`${course.name}, ${course.university.shortName}`} variant="outline" />
              </span>
            </th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const Icon = ROW_ICONS[row.label];
            const long = row.cells.some(cell => cell.value.length > LONG_VALUE) || undefined;
            return <tr key={row.label} data-same={(courses.length > 1 && row.same) || undefined} data-long={long}>
              <th scope="row">{Icon ? <Icon size={18} aria-hidden="true" /> : null}<span>{row.label}</span></th>
              {row.cells.map((cell, index) => <td key={courses[index].id}><Who course={courses[index]} /><span className="uv-cmp-val">{cell.value}</span></td>)}
            </tr>;
          })}
          {nextSteps ? <tr className="uv-cmp-next" data-long>
            <th scope="row"><span>Next steps</span></th>
            {courses.map(course => <td key={course.id}><Who course={course} /><span className="comparison-course-actions">
              <Link href={`/courses/${course.slug}`} className="btn secondary">View course</Link>
              <Link href={`/lead?course=${course.id}&intent=enquire`} rel="nofollow" data-open-lead className="btn primary">Apply now</Link>
            </span></td>)}
          </tr> : null}
        </tbody>
      </table>
    </div>
  </div>;
}
