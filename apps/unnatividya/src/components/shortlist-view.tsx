"use client";
import { useRef, useState } from "react";
import { useCatalog } from "@/components/catalog-provider";
import Image from "next/image";
import Link from "next/link";
import { useShortlist } from "@/lib/use-shortlist";
import { formatFee } from "@/lib/catalog-format";
import { type Course } from "@/data/catalog";
import { universityMedia } from "@/data/media";

export function ShortlistView({ courses }: { courses: Course[] }) {
  const { courseWithUniversity } = useCatalog();
  const { ids, ready, setSaved } = useShortlist();
  const [selection, setSelection] = useState<string[]>([]);
  const [removed, setRemoved] = useState<Course | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const saved = courses.filter(course => ids.includes(course.id)).map(courseWithUniversity);
  const selected = selection.filter(id => saved.some(course => course.id === id));
  const fees = saved.map(course => course.fee).filter(fee => Number.isFinite(fee) && fee > 0);

  function remove(course: Course) {
    setSaved(course.id, false);
    setSelection(current => current.filter(id => id !== course.id));
    setRemoved(course);
    heading.current?.focus();
  }
  function undo() {
    if (!removed) return;
    setSaved(removed.id, true);
    setRemoved(null);
    heading.current?.focus();
  }
  if (!ready) return <p role="status">Loading your saved courses…</p>;

  return <section className="shortlist-workspace" aria-labelledby="shortlist-summary">
    <h2 id="shortlist-summary" ref={heading} tabIndex={-1}>{saved.length ? `${saved.length} saved program${saved.length === 1 ? "" : "s"}` : "Your saved programs"}</h2>
    <p className="shortlist-help">Saved in this browser. Use the heart on a course to save it for later.</p>
    {removed && <div className="shortlist-undo"><p role="status">Removed {removed.name} — {courseWithUniversity(removed).university.shortName}.</p><button type="button" className="btn secondary" onClick={undo}>Undo removal</button></div>}
    {!saved.length ? <div className="illustrated-empty-state">
      <Image className="state-illustration" src="/states/shortlist-empty.webp" alt="" width={800} height={600} sizes="(max-width: 400px) 60vw, 240px" />
      <h3 className="empty-state-title">Nothing saved yet</h3>
      <p>Save courses while you explore, then return here to compare your options.</p>
      <Link href="/courses" className="btn primary">Browse courses</Link>
    </div> : <>
      <div className="shortlist-toolbar">
        <div><p id="shortlist-compare-help">Choose two or three saved programs to compare.</p><p role="status">{selected.length} of 3 selected{fees.length ? ` · Listed tuition ${formatFee(Math.min(...fees))}–${formatFee(Math.max(...fees))}` : ""}</p></div>
        <div className="shortlist-toolbar-actions">
          {selected.length >= 2 ? <Link href={`/compare?add=${selected.join(",")}`} className="btn primary">Compare selected ({selected.length})</Link> : <button className="btn primary" disabled aria-describedby="shortlist-compare-help">Compare selected</button>}
          <Link href="/courses" className="btn secondary">Browse more courses</Link>
        </div>
      </div>
      <div className="shortlist-cards">
        {saved.map(course => <article className="shortlist-card" key={course.id} aria-labelledby={`saved-${course.id}`}>
          <div className="shortlist-card-top"><Image src={universityMedia[course.universityId].logo} alt="" width={32} height={32} /><button type="button" className="btn ghost" aria-label={`Remove ${course.name} — ${course.university.shortName}`} onClick={() => remove(course)}>Remove</button></div>
          <div><h3 id={`saved-${course.id}`}>{course.name}</h3><p>{course.university.name}</p></div>
          <dl className="shortlist-course-facts"><div><dt>Listed total tuition</dt><dd>{formatFee(course.fee)}</dd></div><div><dt>Duration</dt><dd>{course.duration}</dd></div><div><dt>EMI from</dt><dd>{course.emi}</dd></div></dl>
          <details className="shortlist-additional"><summary>Ratings and placement figures</summary><p>Rating {course.rating} / 5 · University placement rate {course.university.placement}%</p></details>
          <label className="shortlist-select"><input type="checkbox" checked={selected.includes(course.id)} disabled={!selected.includes(course.id) && selected.length >= 3} onChange={() => setSelection(selected.includes(course.id) ? selected.filter(id => id !== course.id) : [...selected, course.id])} aria-label={`Compare ${course.name} — ${course.university.shortName}`} />Select for comparison</label>
          <div className="shortlist-card-actions"><Link href={`/courses/${course.slug}`} className="btn secondary">View course</Link><Link href={`/lead?course=${course.id}&intent=enquire`} data-open-lead className="btn primary">Apply now</Link></div>
        </article>)}
      </div>
    </>}
  </section>;
}
