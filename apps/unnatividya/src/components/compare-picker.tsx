"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CompareGate } from "@/components/compare-gate";
import { trackEvent } from "@/components/analytics";
import { formatFee } from "@/lib/catalog-format";
import { type Course, type University } from "@/data/catalog";
import { universityMedia } from "@/data/media";
import { buildComparisonRows } from "@/lib/comparisons";

type PickerCourse = Course & { university: University };

export function ComparePicker({ allCourses, initialSelectedIds }: { allCourses: PickerCourse[]; initialSelectedIds: string[] }) {
  const params = useSearchParams();
  const initialSelection = useRef(initialSelectedIds);
  useEffect(() => {
    if (initialSelection.current.length >= 2) trackEvent("compare_view", { course_ids: initialSelection.current });
  }, []);
  const requested = params.has("add") ? params.getAll("add").flatMap(value => value.split(",")) : initialSelectedIds;
  const selectedIds = [...new Set(requested)].filter(id => allCourses.some(course => course.id === id)).slice(0, 3);
  const selected = selectedIds.map(id => allCourses.find(course => course.id === id)!);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const [stream, setStream] = useState("");
  const [university, setUniversity] = useState("");
  const addButton = useRef<HTMLButtonElement>(null);
  const selectionHeading = useRef<HTMLHeadingElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const universities = [...new Map(allCourses.map(course => [course.university.id, course.university.shortName])).entries()];
  const streams = [...new Set(allCourses.map(course => course.stream))].sort();
  const results = allCourses.filter(course =>
    (!query.trim() || `${course.name} ${course.shortName} ${course.university.name} ${course.university.shortName}`.toLowerCase().includes(query.trim().toLowerCase())) &&
    (!level || course.level === level) && (!stream || course.stream === stream) && (!university || course.universityId === university));

  useEffect(() => {
    if (pickerOpen) search.current?.focus();
    window.dispatchEvent(new Event(pickerOpen ? "uv-hide-sticky-ctas" : "uv-show-sticky-ctas"));
    return () => { if (pickerOpen) window.dispatchEvent(new Event("uv-show-sticky-ctas")); };
  }, [pickerOpen]);

  function updateSelection(ids: string[]) {
    const url = new URL(window.location.href);
    url.searchParams.set("add", ids.join(","));
    window.history.pushState(null, "", url);
  }
  function closePicker() { setPickerOpen(false); addButton.current?.focus(); }
  function addCourse(id: string) {
    if (selectedIds.includes(id) || selectedIds.length >= 3) return;
    const next = [...selectedIds, id];
    updateSelection(next);
    trackEvent("compare_course_added", { course_id: id });
    if (next.length === 3) { setPickerOpen(false); selectionHeading.current?.focus(); }
    else search.current?.focus();
  }
  function removeCourse(id: string) {
    updateSelection(selectedIds.filter(value => value !== id));
    trackEvent("compare_selection_change", { course_id: id, action: "removed" });
    selectionHeading.current?.focus();
  }
  function resetFilters() { setQuery(""); setLevel(""); setStream(""); setUniversity(""); search.current?.focus(); }

  return <section className="uv-comparison" aria-labelledby="comparison-selection-title">
    <h2 id="comparison-selection-title" ref={selectionHeading} tabIndex={-1}>Your comparison</h2>
    <p role="status">{selected.length} of 3 programs selected. Choose at least two to compare.</p>
    <div className="comparison-selection">
      {selected.map(course => <article className="comparison-slot" key={course.id}>
        <Image src={universityMedia[course.universityId].logo} alt="" width={32} height={32} />
        <h3>{course.name}</h3><p>{course.university.shortName}</p><p>{formatFee(course.fee)} · {course.duration}</p>
        <button type="button" className="comparison-remove" onClick={() => removeCourse(course.id)} aria-label={`Remove ${course.name} — ${course.university.shortName}`}>×</button>
      </article>)}
    </div>
    <button ref={addButton} className="btn secondary comparison-add" type="button" disabled={selected.length >= 3} aria-expanded={pickerOpen} aria-controls="comparison-picker" onClick={() => pickerOpen ? closePicker() : setPickerOpen(true)}>{selected.length >= 3 ? "Three programs selected" : "Add a program"}</button>
    {pickerOpen && <div id="comparison-picker" className="comparison-picker-panel" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); closePicker(); } }}>
      <div className="comparison-picker-heading"><h3>Find a program</h3><button type="button" className="btn ghost" onClick={closePicker}>Close picker</button></div>
      <div className="comparison-filters">
        <label className="comparison-search">Search programs<input ref={search} type="search" value={query} maxLength={200} onChange={event => setQuery(event.target.value)} placeholder="Course or university" /></label>
        <div className="comparison-filter-field"><label htmlFor="comparison-level">Degree level</label><select id="comparison-level" value={level} onChange={event => setLevel(event.target.value)}><option value="">All levels</option><option value="UG">Undergraduate</option><option value="PG">Postgraduate</option></select></div>
        <div className="comparison-filter-field"><label htmlFor="comparison-stream">Stream</label><select id="comparison-stream" value={stream} onChange={event => setStream(event.target.value)}><option value="">All streams</option>{streams.map(value => <option key={value}>{value}</option>)}</select></div>
        <div className="comparison-filter-field"><label htmlFor="comparison-university">University</label><select id="comparison-university" value={university} onChange={event => setUniversity(event.target.value)}><option value="">All universities</option>{universities.map(([id,name]) => <option value={id} key={id}>{name}</option>)}</select></div>
      </div>
      <div className="comparison-picker-heading"><p role="status">{results.length} matching programs</p><button type="button" className="btn ghost" onClick={resetFilters}>Reset filters</button></div>
      <ul className="comparison-results" aria-label="Matching programs">
        {results.map(course => <li key={course.id}>
          <div><strong>{course.name}</strong><p>{course.university.shortName} · {formatFee(course.fee)} · {course.duration}</p></div>
          <button type="button" className="btn secondary" disabled={selectedIds.includes(course.id) || selected.length >= 3} aria-label={`${selectedIds.includes(course.id) ? "Selected" : "Add"} ${course.name} — ${course.university.shortName}`} onClick={() => addCourse(course.id)}>{selectedIds.includes(course.id) ? "Selected" : "Add"}</button>
        </li>)}
      </ul>
      {!results.length && <p className="comparison-no-results">No matching programs. Change your search or reset the filters.</p>}
    </div>}
    <CompareGate selectedCount={selected.length}>
      <div className="comparison-data-region" role="region" aria-label="Selected program comparison" tabIndex={0}>
        <table className="comparison-data">
          <caption>Selected program details. Confirm current fees and eligibility on each course page.</caption>
          <thead><tr><th scope="col">Criteria</th>{selected.map(course => <th scope="col" key={course.id}>{course.name}<small>{course.university.shortName}</small></th>)}</tr></thead>
          <tbody>{buildComparisonRows(selected).map(row => <tr key={row.label}><th scope="row">{row.label}</th>{row.cells.map((cell,index) => <td key={selected[index].id}><span className="comparison-mobile-label" aria-hidden="true">{selected[index].name} · {selected[index].university.shortName}</span>{cell.value}</td>)}</tr>)}
          <tr><th scope="row">Next steps</th>{selected.map(course => <td key={course.id}><span className="comparison-mobile-label" aria-hidden="true">{course.name} · {course.university.shortName}</span><div className="comparison-course-actions"><Link href={`/courses/${course.slug}`} className="btn secondary">View course</Link><Link href={`/lead?course=${course.id}&intent=enquire`} data-open-lead className="btn primary">Apply now</Link></div></td>)}</tr></tbody>
        </table>
      </div>
    </CompareGate>
  </section>;
}
