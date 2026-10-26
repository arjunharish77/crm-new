"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Bookmark, Headset, Link2, Printer, StickyNote } from "lucide-react";
import { useCatalog } from "@/components/catalog-provider";
import { CourseCard } from "@/components/course-card";
import { useShortlist } from "@/lib/use-shortlist";
import { COMPARE_LIMIT, compareHref, useCompareList } from "@/lib/use-compare-list";
import { type Course } from "@/data/catalog";
import { FeeGroupSwitch } from "@/components/fee-group";

// Programs suggested under the empty state (design Shortlist "suggest"). Not a popularity claim.
const SUGGESTED = ["mba-muj", "mca-smu", "bca-muj"];
// Wave 4 A5: private notes per saved program, kept only in this browser (never sent anywhere).
const NOTES_KEY = "uv_shortlist_notes";
const NOTE_LIMIT = 500;

function readNotes(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(NOTES_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string").map(([id, note]) => [id, note.slice(0, NOTE_LIMIT)]));
  } catch {
    return {};
  }
}

function writeNotes(notes: Record<string, string>) {
  try { window.localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch { /* notes are a convenience */ }
}

function NoteField({ courseId, label, note, onChange }: { courseId: string; label: string; note: string; onChange: (value: string) => void }) {
  const id = `shortlist-note-${courseId}`;
  return <details className="uv-sl-note" open={Boolean(note) || undefined}>
    <summary><StickyNote size={16} aria-hidden="true" />{note ? "Your note" : "Add a note"}<span className="sr-only">: {label}</span></summary>
    <label htmlFor={id} className="sr-only">Note for {label}</label>
    <textarea id={id} maxLength={NOTE_LIMIT} rows={3} value={note} placeholder="Questions to ask, fees to confirm, deadlines…" onChange={event => onChange(event.target.value)} aria-describedby={`${id}-help`} />
    <p id={`${id}-help`} className="uv-sl-note-help">Saved only in this browser. {NOTE_LIMIT - note.length} characters left.</p>
  </details>;
}

// Saved courses (design Shortlist.dc.html; plan D §4, Q4 naming). Cards are the shared CourseCard:
// its bookmark removes a course (with undo here) and its Compare toggle chooses programs through
// the shared compare list, which the hero's "Compare N" button follows.
export function ShortlistView({ courses }: { courses: Course[] }) {
  const { courseWithUniversity } = useCatalog();
  const { ids, ready, setSaved } = useShortlist();
  const compare = useCompareList();
  const [removed, setRemoved] = useState<Course[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [sharedIds, setSharedIds] = useState<string[]>([]);
  const [linkState, setLinkState] = useState<"idle" | "copied" | "manual">("idle");
  useEffect(() => {
    setNotes(readNotes());
    // A shared link (/shortlist?ids=…) shows those programs separately; nothing is saved until the
    // visitor chooses to, and ids that are not published programs are ignored.
    const requested = (new URLSearchParams(window.location.search).get("ids") || "").split(",").map(id => id.trim()).filter(Boolean);
    setSharedIds([...new Set(requested)].filter(id => courses.some(course => course.id === id)).slice(0, 12));
  }, [courses]);
  function updateNote(courseId: string, value: string) {
    setNotes(current => {
      const next = { ...current };
      if (value.trim()) next[courseId] = value.slice(0, NOTE_LIMIT); else delete next[courseId];
      writeNotes(next);
      return next;
    });
  }
  const heading = useRef<HTMLHeadingElement>(null);
  const pendingRemoval = useRef<string | null>(null);
  const saved = courses.filter(course => ids.includes(course.id)).map(courseWithUniversity);
  const savedIds = saved.map(course => course.id);
  const picked = compare.ids.filter(id => savedIds.includes(id));
  const targets = picked.length >= 2 ? picked : savedIds.slice(0, COMPARE_LIMIT);
  const suggestions = SUGGESTED.map(id => courses.find(course => course.id === id)).filter((course): course is Course => Boolean(course)).map(courseWithUniversity);

  // A bookmark click on one of the cards removes that course: offer undo and keep focus on the page.
  useEffect(() => {
    const id = pendingRemoval.current;
    if (!id || ids.includes(id)) return;
    pendingRemoval.current = null;
    const course = courses.find(item => item.id === id);
    if (course) { setRemoved([course]); heading.current?.focus(); }
  }, [ids, courses]);

  function clearAll() {
    const all = courses.filter(course => ids.includes(course.id));
    for (const course of all) setSaved(course.id, false);
    setRemoved(all);
    heading.current?.focus();
  }
  function undo() {
    for (const course of removed) setSaved(course.id, true);
    setRemoved([]);
    heading.current?.focus();
  }

  const shared = sharedIds.filter(id => !savedIds.includes(id)).map(id => courses.find(course => course.id === id)).filter((course): course is Course => Boolean(course)).map(courseWithUniversity);
  const shareUrl = typeof window === "undefined" || !savedIds.length ? "" : `${window.location.origin}/shortlist?ids=${savedIds.map(encodeURIComponent).join(",")}`;
  async function copyLink() {
    try { await navigator.clipboard.writeText(shareUrl); setLinkState("copied"); }
    catch { setLinkState("manual"); }
  }
  function saveShared() {
    for (const course of shared) setSaved(course.id, true);
    const url = new URL(window.location.href); url.searchParams.delete("ids");
    window.history.replaceState(window.history.state, "", url);
    setSharedIds([]);
    requestAnimationFrame(() => heading.current?.focus());
  }
  function dismissShared() {
    const url = new URL(window.location.href); url.searchParams.delete("ids");
    window.history.replaceState(window.history.state, "", url);
    setSharedIds([]);
  }

  const subtitle = !ready ? "Loading your saved courses…" : saved.length ? `${saved.length} saved program${saved.length === 1 ? "" : "s"} · saved on this device` : "Save programs to compare and revisit later.";
  const removedLabel = removed.length === 1 ? `Removed ${removed[0].name} — ${courseWithUniversity(removed[0]).university.shortName}.` : `Removed ${removed.length} saved programs.`;

  return <>
    <section className="uv-page-hero uv-sl-hero" aria-labelledby="shortlist-title">
      <div className="uv-page-hero-inner">
        <div>
          <ol className="uv-breadcrumb" aria-label="Breadcrumb">
            <li><Link href="/">Home</Link></li>
            <li aria-current="page">Saved courses</li>
          </ol>
          <h1 id="shortlist-title" className="uv-h1">Saved courses</h1>
          <p className="uv-sl-sub" role={ready ? undefined : "status"}>{subtitle}</p>
        </div>
        {ready && saved.length ? <div className="uv-sl-hero-actions">
          {targets.length >= 2
            ? <Link href={compareHref(targets)} className="btn primary large"><ArrowLeftRight size={20} aria-hidden="true" />Compare {targets.length}</Link>
            : <button type="button" className="btn primary large" disabled aria-describedby="shortlist-compare-help"><ArrowLeftRight size={20} aria-hidden="true" />Compare</button>}
          <button type="button" className="btn secondary large" onClick={() => void copyLink()}><Link2 size={18} aria-hidden="true" />{linkState === "copied" ? "Link copied" : "Copy link"}</button>
          <button type="button" className="btn secondary large" onClick={() => window.print()}><Printer size={18} aria-hidden="true" />Print</button>
          <button type="button" className="btn ghost large uv-sl-clear" onClick={clearAll}>Clear all</button>
        </div> : null}
        <p className="sr-only" role="status">{linkState === "copied" ? "Link to your saved programs copied." : ""}</p>
        {linkState === "manual" ? <div className="uv-sl-share-manual">
          <label htmlFor="shortlist-share-url">Copy this link to share your saved programs</label>
          <input id="shortlist-share-url" readOnly value={shareUrl} onFocus={event => event.currentTarget.select()} />
        </div> : null}
      </div>
    </section>

    <div className="uv-shell uv-sl-main">
      <p className="uv-sl-print-head">Saved courses · printed from unnatividya.com. Confirm fees, eligibility and recognition with the university.</p>
      {ready && shared.length ? <section className="uv-sl-shared" aria-labelledby="shortlist-shared-title">
        <div className="uv-sl-shared-head">
          <div>
            <h2 id="shortlist-shared-title" className="uv-h2 is-inner">Shared with you</h2>
            <p className="uv-sl-help">{shared.length} program{shared.length === 1 ? "" : "s"} from a shared link. Save them to keep them on this device.</p>
          </div>
          <div className="uv-sl-shared-actions">
            <button type="button" className="btn primary" onClick={saveShared}>Save {shared.length === 1 ? "this program" : `these ${shared.length}`}</button>
            <button type="button" className="btn ghost" onClick={dismissShared}>Dismiss</button>
          </div>
        </div>
        <ul className="uv-card-grid uv-sl-grid">
          {shared.map(course => <li key={course.id}><CourseCard course={course} trackSource="shortlist_shared" /></li>)}
        </ul>
      </section> : null}
      {/* With only a shared list open, the empty state and suggestions would compete with it. */}
      {ready && !(shared.length && !saved.length) ? <section className="uv-sl-workspace" aria-labelledby="shortlist-summary">
        <div className={saved.length ? "uv-sl-head" : "uv-empty uv-sl-empty"}>
          {saved.length ? null : <div className="uv-empty-art" aria-hidden="true"><span><Bookmark size={28} /></span><i /><i /></div>}
          <h2 id="shortlist-summary" className={saved.length ? "uv-h2 is-inner" : undefined} ref={heading} tabIndex={-1}>{saved.length ? "Your saved programs" : "Your shortlist is empty"}</h2>
          {saved.length ? <p id="shortlist-compare-help" className="uv-sl-help">
            {saved.length < 2 ? "Save at least two programs to compare them." : picked.length >= 2 ? `Compare opens the ${picked.length} programs you marked with Compare.` : `Compare opens your first ${targets.length} saved programs. Use Compare on a card to choose others (up to ${COMPARE_LIMIT}).`}
            {" "}Tap the bookmark on a card to remove it.
          </p> : <p>Tap the bookmark on any program to save it here. Your saved courses stay on this device.</p>}
          {saved.length ? null : <div className="uv-empty-actions">
            <Link href="/courses" className="btn primary large">Browse programs</Link>
            <Link href="/recommender" className="btn secondary large">Find my course</Link>
          </div>}
        </div>
        {removed.length ? <div className="uv-sl-undo"><p role="status">{removedLabel}</p><button type="button" className="btn secondary" onClick={undo}>Undo removal</button></div> : null}

        {saved.length ? <>
          <FeeGroupSwitch id="shortlist-fee-group" className="uv-sl-fee-group" />
          <ul className="uv-card-grid uv-sl-grid" onClickCapture={event => {
            const button = event.target instanceof Element ? event.target.closest(".uv-save[data-saved]") : null;
            const item = button?.closest<HTMLElement>("[data-course-id]");
            if (item?.dataset.courseId) pendingRemoval.current = item.dataset.courseId;
          }}>
            {saved.map(course => <li key={course.id} data-course-id={course.id}>
              <CourseCard course={course} trackSource="shortlist" />
              <NoteField courseId={course.id} label={`${course.name}, ${course.university.shortName}`} note={notes[course.id] || ""} onChange={value => updateNote(course.id, value)} />
              {notes[course.id] ? <p className="uv-sl-note-print"><strong>Note:</strong> {notes[course.id]}</p> : null}
            </li>)}
          </ul>
          <div className="uv-sl-cta">
            <div className="uv-sl-cta-copy">
              <span className="uv-sl-cta-icon" aria-hidden="true"><Headset size={26} /></span>
              <div>
                <h2>Get a second opinion on your shortlist</h2>
                <p>Talk it through with a counsellor before you apply. Counselling is free.</p>
              </div>
            </div>
            <Link href="/lead?intent=shortlist" rel="nofollow" data-open-lead className="btn primary large">Apply now</Link>
          </div>
        </> : <>
          {suggestions.length ? <section className="uv-sl-suggest" aria-labelledby="shortlist-suggest-title">
            <h2 id="shortlist-suggest-title" className="uv-h2 is-inner">Programs to start with</h2>
            <ul className="uv-card-grid uv-sl-grid">
              {suggestions.map(course => <li key={course.id}><CourseCard course={course} trackSource="shortlist_empty" /></li>)}
            </ul>
          </section> : null}
        </>}
      </section> : null}
    </div>
  </>;
}
