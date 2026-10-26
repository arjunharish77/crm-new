"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLiveSearchParams, writeUrl } from "@/lib/use-live-search-params";
import { ArrowRight, CirclePlus, Printer, RefreshCw, Share2, X } from "lucide-react";
import { CompareGate, useCompareAccess } from "@/components/compare-gate";
import { ComparisonTable } from "@/components/comparison-table";
import { trackEvent } from "@/components/analytics";
import { formatFee } from "@/lib/catalog-format";
import { type CategoryFees, type Course, type University } from "@/data/catalog";
import { universityMedia } from "@/data/media";
import { buildComparisonRows } from "@/lib/comparisons";
import { courseKey, courseLabel } from "@/lib/programmatic-seo";
import { COMPARE_LIMIT, compareHref, useCompareList } from "@/lib/use-compare-list";
import { FeeGroupSwitch, GroupFeeText } from "@/components/fee-group";

type PickerCourse = Course & { university: University; categoryFees?: CategoryFees };

function parseAdd(values: string[]) {
  return values.flatMap(value => value.split(",")).map(value => value.trim()).filter(Boolean);
}

// The gated /compare tool in the design's layout (Compare.dc.html; plan B §3): hero with Share
// and Print, quick-start chips, three slot cards, the OTP gate and the comparison table.
// `?add=` is the page's selection. It is mirrored into the shared compare list (uv_compare) so the
// tray and the cards' Compare toggles match it, but only once the learner has chosen something:
// the default pair shown to a first-time visitor is never written to the list.
export function ComparePicker({ allCourses, initialSelectedIds, presets }: { allCourses: PickerCourse[]; initialSelectedIds: string[]; presets: Array<[string, string]> }) {
  const params = useLiveSearchParams();
  const hasAdd = params.has("add");
  const requested = hasAdd ? parseAdd(params.getAll("add")) : initialSelectedIds;
  const selectedIds = [...new Set(requested)].filter(id => allCourses.some(course => course.id === id)).slice(0, COMPARE_LIMIT);
  const selected = selectedIds.map(id => allCourses.find(course => course.id === id)!);
  const selectedKey = selectedIds.join(",");
  const list = useCompareList();
  const listKey = list.ids.join(",");
  const unlocked = useCompareAccess();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const [stream, setStream] = useState("");
  const [university, setUniversity] = useState("");
  const [shareState, setShareState] = useState<{ key: string; status: "copied" | "manual" } | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const selectionHeading = useRef<HTMLHeadingElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const resolved = useRef(false);
  const writing = useRef(false);
  const universities = [...new Map(allCourses.map(course => [course.university.id, course.university.shortName])).entries()];
  const streams = [...new Set(allCourses.map(course => course.stream))].sort();
  const results = allCourses.filter(course =>
    (!query.trim() || `${course.name} ${course.shortName} ${course.university.name} ${course.university.shortName}`.toLowerCase().includes(query.trim().toLowerCase())) &&
    (!level || course.level === level) && (!stream || course.stream === stream) && (!university || course.universityId === university));
  const sharedDegree = selected.length > 0 && selected.every(course => courseKey(course.name) === courseKey(selected[0].name)) ? courseLabel(selected[0].name) : null;
  const shareHref = compareHref(selectedIds);
  const share = shareState?.key === selectedKey ? shareState.status : null;

  function setUrl(ids: string[], mode: "push" | "replace") {
    const url = new URL(window.location.href);
    url.searchParams.delete("add");
    url.searchParams.set("add", ids.join(","));
    writeUrl(url, mode !== "push");
  }

  // Make the shared list match the page's selection.
  function writeList(ids: string[]) {
    const extra = list.ids.filter(id => !ids.includes(id));
    const missing = ids.filter(id => !list.ids.includes(id));
    if (!extra.length && !missing.length) return;
    writing.current = true;
    list.replace(ids);
  }

  // First load: an explicit ?add= is the learner's choice and updates the shared list; without
  // ?add=, a list built elsewhere (cards, tray) opens here. Otherwise the default pair is only shown.
  useEffect(() => {
    if (!list.ready || resolved.current) return;
    resolved.current = true;
    const listed = list.ids.filter(id => allCourses.some(course => course.id === id));
    if (!hasAdd && listed.length) {
      setUrl(listed, "replace");
      if (listed.length >= 2) trackEvent("compare_view", { course_ids: listed });
      return;
    }
    if (hasAdd) writeList(selectedIds);
    if (selectedIds.length >= 2) trackEvent("compare_view", { course_ids: selectedIds });
    // Runs once, when the shared list has been read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.ready]);

  // Page changes (add, remove, change, quick start, back/forward) update the shared list.
  useEffect(() => {
    if (resolved.current && hasAdd && selectedKey !== listKey) writeList(selectedIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  // List changes made in another tab open here too. While our own write is still rendering, the
  // list state is one step behind, so wait for it to catch up instead of adopting it.
  useEffect(() => {
    if (writing.current) { if (listKey === selectedKey) writing.current = false; return; }
    if (resolved.current && list.ready && listKey !== selectedKey && (hasAdd || list.ids.length)) setUrl(list.ids, "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey]);

  useEffect(() => {
    if (pickerOpen) search.current?.focus();
    window.dispatchEvent(new Event(pickerOpen ? "uv-hide-sticky-ctas" : "uv-show-sticky-ctas"));
    return () => { if (pickerOpen) window.dispatchEvent(new Event("uv-show-sticky-ctas")); };
  }, [pickerOpen]);

  function closePicker() {
    setPickerOpen(false);
    if (opener.current?.isConnected) opener.current.focus();
    else selectionHeading.current?.focus();
  }
  function openPicker(button: HTMLButtonElement) {
    opener.current = button;
    if (pickerOpen) closePicker(); else setPickerOpen(true);
  }
  function addCourse(id: string) {
    if (selectedIds.includes(id) || selectedIds.length >= COMPARE_LIMIT) return;
    const next = [...selectedIds, id];
    setUrl(next, "push");
    trackEvent("compare_course_added", { course_id: id });
    if (next.length === COMPARE_LIMIT) { setPickerOpen(false); selectionHeading.current?.focus(); }
    else search.current?.focus();
  }
  function changeCourse(index: number, id: string) {
    if (!id || selectedIds.includes(id)) return;
    setUrl(selectedIds.map((value, i) => i === index ? id : value), "push");
    trackEvent("compare_selection_change", { course_id: id, action: "changed" });
  }
  function removeCourse(id: string) {
    setUrl(selectedIds.filter(value => value !== id), "push");
    trackEvent("compare_selection_change", { course_id: id, action: "removed" });
    selectionHeading.current?.focus();
  }
  function resetFilters() { setQuery(""); setLevel(""); setStream(""); setUniversity(""); search.current?.focus(); }
  async function shareLink() {
    const url = `${window.location.origin}${shareHref}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareState({ key: selectedKey, status: "copied" });
    } catch {
      setShareState({ key: selectedKey, status: "manual" });
    }
  }

  const slots = Array.from({ length: COMPARE_LIMIT }, (_, index) => selected[index] || null);

  return <>
    <section className="uv-page-hero uv-cmp-hero" aria-labelledby="compare-title">
      <div className="uv-page-hero-inner">
        <ol className="uv-breadcrumb" aria-label="Breadcrumb">
          <li><Link href="/">Home</Link></li>
          <li><Link href="/compare">Compare</Link></li>
          <li aria-current="page">{sharedDegree || "Programs"}</li>
        </ol>
        <div className="uv-cmp-hero-row">
          <div>
            <h1 id="compare-title" className="uv-h1">{sharedDegree ? <>Compare <span className="uv-cmp-accent">{sharedDegree}</span> Programs</> : "Compare programs"}</h1>
            <p className="uv-cmp-lede">Compare fees, duration, recognition and more for up to three programs. Email verification is required to view the full comparison.</p>
          </div>
          <div className="uv-cmp-hero-actions">
            <button type="button" className="uv-cmp-hero-btn" onClick={shareLink} aria-describedby={share === "manual" ? "compare-share-manual" : undefined}>
              <Share2 size={18} aria-hidden="true" />{share === "copied" ? "Link copied" : "Share"}
            </button>
            {unlocked && selected.length >= 2 ? <button type="button" className="uv-cmp-hero-btn" onClick={() => window.print()}>
              <Printer size={18} aria-hidden="true" />Print / Save as PDF
            </button> : null}
          </div>
        </div>
        <p className="sr-only" role="status">{share === "copied" ? "Link to this comparison copied." : ""}</p>
        {share === "manual" ? <label className="uv-cmp-share-manual" id="compare-share-manual">
          <span>Copy this link to share the comparison</span>
          <input type="text" readOnly value={`${window.location.origin}${shareHref}`} onFocus={event => event.currentTarget.select()} />
        </label> : null}
        <div className="uv-cmp-quick">
          <span className="uv-cmp-quick-label" id="compare-quick-label">Quick start</span>
          <ul aria-labelledby="compare-quick-label">
            {presets.map(([label, add]) => <li key={add}><Link href={`/compare?add=${add}`} aria-current={add === selectedKey ? "true" : undefined}>{label}</Link></li>)}
          </ul>
        </div>
      </div>
    </section>

    <div className="uv-shell">
      <section className="uv-cmp-tool" aria-labelledby="comparison-selection-title">
        <div className="uv-cmp-tool-head">
          <h2 id="comparison-selection-title" ref={selectionHeading} tabIndex={-1}>Your comparison</h2>
          <p role="status">{selected.length} of {COMPARE_LIMIT} programs selected.{selected.length < 2 ? " Choose at least two to compare." : ""}</p>
          <FeeGroupSwitch id="compare-fee-group" />
        </div>
        <div className="uv-cmp-slots">
          {slots.map((course, index) => course ? <article className="comparison-slot uv-cmp-slot" key={index} aria-labelledby={`compare-slot-${index}`}>
            <Image className="uv-cmp-slot-img" src={universityMedia[course.universityId]?.src || "/brand/favicon-32x32.png"} alt="" width={176} height={156} sizes="88px" />
            <div className="uv-cmp-slot-body">
              <h3 id={`compare-slot-${index}`}>{course.university.name}</h3>
              <p>{course.name} · <GroupFeeText fee={course.fee} categoryFees={course.categoryFees} short /></p>
              <div className="uv-cmp-slot-actions">
                <Link href={`/courses/${course.slug}`} className="uv-cmp-chip-btn is-primary">View details <ArrowRight size={14} aria-hidden="true" /></Link>
                <span className="uv-cmp-change">
                  <RefreshCw size={15} aria-hidden="true" />
                  <span aria-hidden="true">Change</span>
                  <select value={course.id} onChange={event => changeCourse(index, event.target.value)} aria-label={`Change program in slot ${index + 1} (${course.name}, ${course.university.shortName})`}>
                    {allCourses.map(option => <option key={option.id} value={option.id} disabled={option.id !== course.id && selectedIds.includes(option.id)}>{option.name} — {option.university.shortName}</option>)}
                  </select>
                </span>
                <button type="button" className="comparison-remove uv-cmp-remove" onClick={() => removeCourse(course.id)} aria-label={`Remove ${course.name} — ${course.university.shortName}`}><X size={20} aria-hidden="true" /></button>
              </div>
            </div>
          </article> : <div className="uv-cmp-slot is-empty" key={index}>
            <button type="button" className="uv-cmp-add" aria-expanded={pickerOpen} aria-controls="comparison-picker" onClick={event => openPicker(event.currentTarget)}>
              <CirclePlus size={22} aria-hidden="true" />Add a program
            </button>
          </div>)}
        </div>
        {pickerOpen && <div id="comparison-picker" className="uv-cmp-picker" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); closePicker(); } }}>
          <div className="uv-cmp-picker-head"><h3>Find a program</h3><button type="button" className="btn ghost" onClick={closePicker}>Close picker</button></div>
          <div className="uv-cmp-filters">
            <label className="uv-cmp-search">Search programs<input ref={search} type="search" value={query} maxLength={200} onChange={event => setQuery(event.target.value)} placeholder="Course or university" /></label>
            <div className="uv-cmp-field"><label htmlFor="comparison-level">Degree level</label><select id="comparison-level" value={level} onChange={event => setLevel(event.target.value)}><option value="">All levels</option><option value="UG">Undergraduate</option><option value="PG">Postgraduate</option></select></div>
            <div className="uv-cmp-field"><label htmlFor="comparison-stream">Stream</label><select id="comparison-stream" value={stream} onChange={event => setStream(event.target.value)}><option value="">All streams</option>{streams.map(value => <option key={value}>{value}</option>)}</select></div>
            <div className="uv-cmp-field"><label htmlFor="comparison-university">University</label><select id="comparison-university" value={university} onChange={event => setUniversity(event.target.value)}><option value="">All universities</option>{universities.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></div>
          </div>
          <div className="uv-cmp-picker-head"><p role="status">{results.length} matching programs</p><button type="button" className="btn ghost" onClick={resetFilters}>Reset filters</button></div>
          <ul className="comparison-results uv-cmp-results-list" aria-label="Matching programs">
            {results.map(course => <li key={course.id}>
              <Image src={universityMedia[course.universityId]?.logo || "/brand/favicon-32x32.png"} alt="" width={28} height={28} />
              <div><strong>{course.name}</strong><p>{course.university.shortName} · <GroupFeeText fee={course.fee} categoryFees={course.categoryFees} short /> · {course.duration}</p></div>
              <button type="button" className="btn secondary" disabled={selectedIds.includes(course.id) || selected.length >= COMPARE_LIMIT} aria-label={`${selectedIds.includes(course.id) ? "Selected" : "Add"} ${course.name} — ${course.university.shortName}`} onClick={() => addCourse(course.id)}>{selectedIds.includes(course.id) ? "Selected" : "Add"}</button>
            </li>)}
          </ul>
          {!results.length && <p className="uv-cmp-no-results">No matching programs. Change your search or reset the filters.</p>}
        </div>}
        <CompareGate selectedCount={selected.length} unlocked={unlocked} preview={{
          columns: selected.map(course => ({ id: course.id, universityId: course.universityId, name: course.name, universityName: course.university.name })),
          labels: buildComparisonRows(selected).map(row => row.label),
        }}>
          <ComparisonTable courses={selected} caption="Selected program details. Confirm current fees and eligibility on each course page." regionLabel="Selected program comparison" nextSteps />
        </CompareGate>
      </section>
    </div>
  </>;
}
