import Link from "next/link";
import { SaveButton } from "@/components/save-button";
import { Course, courseWithUniversity, formatFee } from "@/data/catalog";

export function CourseCard({ course }: { course: Course }) {
  const item = courseWithUniversity(course);

  return (
    <article className="card course-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className={`level-badge ${item.level}`}>{item.level}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#555", fontSize: 13 }}>
            <span style={{ color: "#FDB515" }}>★</span> {item.rating}
          </span>
          <SaveButton courseId={item.id} size={30} />
        </div>
      </div>
      <div>
        <h3>{item.name}</h3>
        <div style={{ color: "#707070", fontSize: 13, marginTop: -3 }}>{item.university.name}</div>
      </div>
      <div className="course-meta">
        <span>{item.duration}</span>
        <strong>{formatFee(item.fee)}</strong>
        <span>EMI {item.emi}</span>
      </div>
      <div className="trust-strip">
        {item.specializations.slice(0, 4).map((spec) => (
          <span className="mini-chip" key={spec}>
            {spec}
          </span>
        ))}
      </div>
      <div className="course-actions">
        <Link
          href={`/courses/${item.slug}`}
          className="btn primary"
          data-track-event="course_card_click"
          data-track-params={JSON.stringify({ course_id: item.id, action: "view" })}
        >
          View course
        </Link>
        <Link href={`/lead?course=${item.id}&intent=enquire`} className="btn ghost" data-open-lead>
          Enquire
        </Link>
        <Link
          href={`/compare?add=${item.id}`}
          className="btn secondary"
          data-track-event="compare_course_added"
          data-track-params={JSON.stringify({ course_id: item.id })}
        >
          Compare
        </Link>
      </div>
    </article>
  );
}
