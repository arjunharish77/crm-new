"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CompareGate } from "@/components/compare-gate";
import { trackEvent } from "@/components/analytics";
import { formatFee, type Course, type University } from "@/data/catalog";
import { universityMedia } from "@/data/media";
import { buildComparisonRows } from "@/lib/comparisons";

type PickerCourse = Course & { university: University };

const LEVEL_OPTIONS = [["UG", "Undergraduate"], ["PG", "Postgraduate"]] as const;
const STREAM_OPTIONS = ["Management", "IT & Computers", "Commerce", "Arts & Humanities"];

function SlotCard({ course, onRemove }: { course: PickerCourse; onRemove: () => void }) {
  return (
    <div style={{ border: "1.5px solid #544CC8", borderRadius: 8, padding: 16, background: "rgba(84,76,200,0.04)", position: "relative" }}>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${course.name}`}
        style={{ position: "absolute", top: 10, right: 10, width: 24, height: 24, borderRadius: "50%", border: "none", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.16)", color: "#707070", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        ✕
      </button>
      <span style={{ position: "relative", width: 32, height: 32, display: "inline-block", marginBottom: 8 }}>
        <Image src={universityMedia[course.universityId].logo} alt="" fill sizes="32px" style={{ objectFit: "contain" }} />
      </span>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#363634", paddingRight: 20 }}>{course.name}</div>
      <div style={{ fontSize: 12, color: "#707070", marginTop: 2 }}>{course.university.shortName}</div>
      <div style={{ fontSize: 12, color: "#555", marginTop: 8 }}>{formatFee(course.fee)} · {course.duration}</div>
    </div>
  );
}

function EmptySlot({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: "1.5px dashed #CFDAE6",
        borderRadius: 8,
        padding: 16,
        background: disabled ? "#F7F8F9" : "#fff",
        color: disabled ? "#AAAAAA" : "#544CC8",
        fontSize: 14,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        minHeight: 116,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
      }}
    >
      + Add a program
    </button>
  );
}

export function ComparePicker({ allCourses, initialSelectedIds }: { allCourses: PickerCourse[]; initialSelectedIds: string[] }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);

  // useState's initial value only applies on first mount -- when the URL's ?add= param changes
  // from an EXTERNAL source (a preset Link, browser back/forward), the parent server component
  // re-renders with a new initialSelectedIds prop, but React keeps this same component instance
  // and its existing state, so that new prop would otherwise be silently ignored (URL changes,
  // UI doesn't). Syncing on the prop's actual value, not the array reference, so this doesn't
  // also fire (and do nothing) on every render caused by a fresh-but-identical array literal.
  const initialIdsKey = initialSelectedIds.join(",");
  useEffect(() => {
    setSelectedIds(initialSelectedIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIdsKey]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<string[]>([]);
  const [streamFilter, setStreamFilter] = useState<string[]>([]);
  const [universityFilter, setUniversityFilter] = useState<string[]>([]);

  const byId = useMemo(() => new Map(allCourses.map((course) => [course.id, course])), [allCourses]);
  const universityOptions = useMemo(
    () => [...new Map(allCourses.map((course) => [course.university.id, course.university.shortName])).entries()],
    [allCourses],
  );
  const selected = selectedIds.map((id) => byId.get(id)).filter((course): course is PickerCourse => Boolean(course));

  // Page-view-style event, meant to fire once on mount based on the initial (server-provided)
  // selection -- matches the TrackOnMount pattern used elsewhere, deliberately not re-firing as
  // the visitor adds/removes programs afterwards.
  useEffect(() => {
    if (initialSelectedIds.length >= 2) {
      trackEvent("compare_view", { course_ids: initialSelectedIds });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The picker's results list can scroll tall enough to land under the fixed "Request a
  // callback" corner button -- hide it for as long as the picker stays open (see sticky-ctas.tsx).
  useEffect(() => {
    window.dispatchEvent(new Event(pickerOpen ? "uv-hide-sticky-ctas" : "uv-show-sticky-ctas"));
    return () => {
      if (pickerOpen) window.dispatchEvent(new Event("uv-show-sticky-ctas"));
    };
  }, [pickerOpen]);

  function syncUrl(nextIds: string[]) {
    router.replace(`/compare?add=${nextIds.join(",")}`, { scroll: false });
  }

  function addCourse(id: string) {
    if (selectedIds.includes(id) || selectedIds.length >= 3) return;
    const next = [...selectedIds, id];
    setSelectedIds(next);
    syncUrl(next);
    trackEvent("compare_course_added", { course_id: id });
    if (next.length >= 3) setPickerOpen(false);
  }

  function removeCourse(id: string) {
    const next = selectedIds.filter((selectedId) => selectedId !== id);
    setSelectedIds(next);
    syncUrl(next);
    // Complements compare_course_added above -- that one covers adds, this covers removes, so
    // the full add/remove lifecycle of the selection is visible without double-firing on adds.
    trackEvent("compare_selection_change", { course_id: id, action: "removed" });
  }

  function toggleFilter(setter: (updater: (current: string[]) => string[]) => void, value: string) {
    setter((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  }

  const results = useMemo(() => {
    const text = query.trim().toLowerCase();
    return allCourses.filter((course) => {
      const haystack = `${course.name} ${course.university.name} ${course.university.shortName} ${course.stream}`.toLowerCase();
      return (
        (!text || haystack.includes(text)) &&
        (!levelFilter.length || levelFilter.includes(course.level)) &&
        (!streamFilter.length || streamFilter.includes(course.stream)) &&
        (!universityFilter.length || universityFilter.includes(course.university.id))
      );
    });
  }, [allCourses, query, levelFilter, streamFilter, universityFilter]);

  const slotsFull = selectedIds.length >= 3;

  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#696868", letterSpacing: 0.4, marginBottom: 8 }}>
        OR BUILD YOUR OWN ({selectedIds.length} of 3)
      </div>
      <div className="grid three" style={{ marginBottom: pickerOpen ? 12 : 20 }}>
        {[0, 1, 2].map((slotIndex) => {
          const course = selected[slotIndex];
          return course ? (
            <SlotCard course={course} key={course.id} onRemove={() => removeCourse(course.id)} />
          ) : (
            <EmptySlot key={`empty-${slotIndex}`} disabled={slotsFull && slotIndex >= selectedIds.length} onClick={() => setPickerOpen(true)} />
          );
        })}
      </div>

      {pickerOpen ? (
        <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, background: "#fff", marginBottom: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #EAEAEA" }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a program or university…"
              autoFocus
              style={{ flex: 1, height: 40, border: "1px solid #CFDAE6", borderRadius: 4, padding: "0 12px", fontSize: 14, marginRight: 12 }}
            />
            <button type="button" onClick={() => setPickerOpen(false)} aria-label="Close" style={{ border: "none", background: "none", fontSize: 18, color: "#707070", cursor: "pointer", padding: 4 }}>
              ✕
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "12px 16px", borderBottom: "1px solid #EAEAEA" }}>
            {LEVEL_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => toggleFilter(setLevelFilter, value)}
                style={{
                  border: `1px solid ${levelFilter.includes(value) ? "#544CC8" : "#CFDAE6"}`,
                  background: levelFilter.includes(value) ? "rgba(84,76,200,0.08)" : "#fff",
                  color: levelFilter.includes(value) ? "#544CC8" : "#555",
                  borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
            {STREAM_OPTIONS.map((stream) => (
              <button
                key={stream}
                type="button"
                onClick={() => toggleFilter(setStreamFilter, stream)}
                style={{
                  border: `1px solid ${streamFilter.includes(stream) ? "#544CC8" : "#CFDAE6"}`,
                  background: streamFilter.includes(stream) ? "rgba(84,76,200,0.08)" : "#fff",
                  color: streamFilter.includes(stream) ? "#544CC8" : "#555",
                  borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                {stream}
              </button>
            ))}
            {universityOptions.map(([id, shortName]) => (
              <button
                key={id}
                type="button"
                onClick={() => toggleFilter(setUniversityFilter, id)}
                style={{
                  border: `1px solid ${universityFilter.includes(id) ? "#544CC8" : "#CFDAE6"}`,
                  background: universityFilter.includes(id) ? "rgba(84,76,200,0.08)" : "#fff",
                  color: universityFilter.includes(id) ? "#544CC8" : "#555",
                  borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                {shortName}
              </button>
            ))}
          </div>
          <div style={{ maxHeight: 340, overflowY: "auto" }}>
            {results.length ? (
              results.map((course) => {
                const isSelected = selectedIds.includes(course.id);
                const disabled = isSelected || slotsFull;
                return (
                  <div key={course.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid #F5F5F5" }}>
                    <span style={{ position: "relative", width: 28, height: 28, flexShrink: 0 }}>
                      <Image src={universityMedia[course.universityId].logo} alt="" fill sizes="28px" style={{ objectFit: "contain" }} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#363634" }}>{course.name}</div>
                      <div style={{ fontSize: 12, color: "#707070" }}>{course.university.shortName} · {course.stream} · {formatFee(course.fee)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => addCourse(course.id)}
                      disabled={disabled}
                      style={{
                        flexShrink: 0,
                        border: "none",
                        borderRadius: 999,
                        padding: "6px 14px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: disabled ? "default" : "pointer",
                        background: isSelected ? "rgba(46,125,50,0.10)" : slotsFull ? "#F5F5F5" : "#544CC8",
                        color: isSelected ? "#2E7D32" : slotsFull ? "#AAAAAA" : "#fff",
                      }}
                    >
                      {isSelected ? "Selected" : slotsFull ? "Slots full" : "+ Add"}
                    </button>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "#707070", fontSize: 14 }}>
                Nothing matches that search.
              </div>
            )}
          </div>
        </div>
      ) : null}

      <CompareGate selectedCount={selected.length}>
        <div className="compare-table">
          <div className="compare-grid" style={{ gridTemplateColumns: `190px repeat(${selected.length}, 1fr)` }}>
            <div className="compare-head">CRITERIA</div>
            {selected.map((course) => (
              <div className="compare-head compare-program" key={course.id}>
                <span style={{ position: "relative", width: 32, height: 32, display: "inline-block", marginBottom: 6 }}>
                  <Image src={universityMedia[course.universityId].logo} alt="" fill sizes="32px" style={{ objectFit: "contain" }} />
                </span>
                <strong>{course.name}</strong>
                <small>{course.university.name}</small>
              </div>
            ))}
            {buildComparisonRows(selected).flatMap((row) => [
              <div className="compare-cell compare-row-label" key={`${row.label}-label`}>{row.label}</div>,
              ...row.cells.map((cell, index) => (
                <div
                  className="compare-cell"
                  style={cell.best ? { fontWeight: 700, background: "rgba(46,125,50,0.08)" } : undefined}
                  key={`${row.label}-${index}`}
                >
                  {cell.value}
                </div>
              )),
            ])}
            <div className="compare-cell compare-row-label" />
            {selected.map((course) => (
              <div className="compare-cell" key={`${course.id}-actions`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Link href={`/courses/${course.slug}`} className="btn primary" style={{ height: 36, fontSize: 13 }}>View</Link>
                <Link href={`/lead?course=${course.id}&intent=enquire`} data-open-lead className="btn secondary" style={{ height: 36, fontSize: 13 }}>Enquire</Link>
              </div>
            ))}
          </div>
        </div>
      </CompareGate>
    </>
  );
}
