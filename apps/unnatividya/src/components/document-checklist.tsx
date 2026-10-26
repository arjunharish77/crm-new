"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Printer } from "lucide-react";
import { useCatalog } from "@/components/catalog-provider";
import { DOCUMENT_SOURCES, documentsFor, type DocumentCategory, type DocumentItem } from "@/data/admission-documents";
import { formatCheckedDate, sourceHost } from "@/lib/source-checks";

const CATEGORY_LABELS: Record<DocumentCategory, string> = { indian: "Indian applicant", nri: "NRI applicant", foreign: "Foreign applicant" };
const TICKS_KEY = "uv_document_checklist";

function readTicks(): Record<string, string[]> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(TICKS_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]))) : {};
  } catch {
    return {};
  }
}

// Wave 4 A1: a printable admission document checklist per program and applicant category. Items come
// only from official university pages (src/data/admission-documents.ts); ticks stay in this browser.
export function DocumentChecklist({ initialCourseId, initialCategory = "indian" }: { initialCourseId: string; initialCategory?: DocumentCategory }) {
  const { courses, courseWithUniversity } = useCatalog();
  const all = courses.map(courseWithUniversity).sort((a, b) => a.name.localeCompare(b.name) || a.university.shortName.localeCompare(b.university.shortName));
  const [courseId, setCourseId] = useState(all.some(course => course.id === initialCourseId) ? initialCourseId : "");
  const [category, setCategory] = useState<DocumentCategory>(initialCategory);
  const [ticks, setTicks] = useState<Record<string, string[]>>({});
  useEffect(() => { setTicks(readTicks()); }, []);
  const selected = all.find(course => course.id === courseId);
  const list = selected ? documentsFor(selected.universityId, selected.level === "PG" ? "PG" : "UG", category) : null;
  const tickKey = `${courseId}:${category}`;
  const done = new Set(ticks[tickKey] || []);
  const required = list?.required.length || 0;
  const requiredDone = list?.required.filter(item => done.has(item.id)).length || 0;
  const usedSources = list ? [...new Set([...list.required, ...list.conditional].flatMap(item => item.sources).concat(list.uploadNote ? [list.uploadNote.source] : []))] : [];

  function toggle(id: string) {
    setTicks(current => {
      const set = new Set(current[tickKey] || []);
      if (set.has(id)) set.delete(id); else set.add(id);
      const next = { ...current, [tickKey]: [...set] };
      try { window.localStorage.setItem(TICKS_KEY, JSON.stringify(next)); } catch { /* ticks are a convenience */ }
      return next;
    });
  }

  const row = (item: DocumentItem) => <li key={item.id}>
    <label>
      <input type="checkbox" checked={done.has(item.id)} onChange={() => toggle(item.id)} />
      <span><strong>{item.label}</strong>{item.detail ? <small>{item.detail}</small> : null}</span>
    </label>
  </li>;

  return <div className="uvt-docs">
    <section className="uvt-card uvt-docs-form" aria-labelledby="documents-form-title">
      <h2 id="documents-form-title" className="uvt-h2-sm">Your program</h2>
      <div className="uvt-field">
        <label htmlFor="documents-course">Program</label>
        <select id="documents-course" className="uvt-control" value={courseId} onChange={event => setCourseId(event.target.value)}>
          <option value="">Choose a program</option>
          {all.map(course => <option key={course.id} value={course.id}>{course.name} — {course.university.shortName}</option>)}
        </select>
      </div>
      <fieldset className="uvt-docs-category">
        <legend>Applicant category</legend>
        {(Object.keys(CATEGORY_LABELS) as DocumentCategory[]).map(value => <label key={value}>
          <input type="radio" name="documents-category" value={value} checked={category === value} onChange={() => setCategory(value)} />
          <span>{CATEGORY_LABELS[value]}</span>
        </label>)}
      </fieldset>
    </section>

    <section className="uvt-card uvt-docs-result" aria-labelledby="documents-result-title">
      <div className="uvt-docs-result-head">
        <h2 id="documents-result-title" className="uvt-h2-sm">{selected ? `${selected.name} — ${selected.university.shortName}` : "Your checklist"}</h2>
        {list ? <button type="button" className="btn secondary" onClick={() => window.print()}><Printer size={18} aria-hidden="true" />Print checklist</button> : null}
      </div>
      {!selected ? <p className="uvt-help-text">Choose a program to see the documents its university lists for your applicant category.</p> : !list ? <p className="uvt-help-text">We have not sourced a document list for this university yet. Confirm the documents with the university before you apply.</p> : <>
        <p className="uvt-docs-progress" role="status">{requiredDone} of {required} required document{required === 1 ? "" : "s"} ready · {CATEGORY_LABELS[category]}</p>
        {list.categoryNote ? <p className="uvt-docs-note"><span className="uv-tag uv-tag-warning">Confirm with the university</span> {list.categoryNote}</p> : null}
        <h3 className="uvt-docs-h3">Required</h3>
        <ul className="uvt-docs-list">{list.required.map(row)}</ul>
        {list.conditional.length ? <>
          <h3 className="uvt-docs-h3">If it applies to you</h3>
          <ul className="uvt-docs-list">{list.conditional.map(row)}</ul>
        </> : null}
        {list.uploadNote ? <p className="uvt-help-text"><strong>Uploading:</strong> {list.uploadNote.text}</p> : null}
        <p className="uvt-help-text">Your ticks are saved only in this browser. The university checks every document and may ask for more; confirm the current list before you pay any fee.</p>
        <div className="uvt-docs-sources">
          <h3 className="uvt-docs-h3">Sources</h3>
          <ul>{usedSources.map(id => { const source = DOCUMENT_SOURCES[id]; return <li key={id}>
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="uv-link">{source.label}<ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
            <span> · {sourceHost(source.url)}, checked {formatCheckedDate(source.checkedAt)}{source.note ? `. ${source.note}` : ""}</span>
          </li>; })}</ul>
        </div>
        <div className="uvt-recog-actions">
          <Link href={`/courses/${selected.slug}`} className="btn secondary">View the program</Link>
          <Link href={`/lead?intent=document-checklist&course=${encodeURIComponent(selected.id)}`} rel="nofollow" data-open-lead className="btn primary">Apply now</Link>
        </div>
      </>}
    </section>
  </div>;
}
