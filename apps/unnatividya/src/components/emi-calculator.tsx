"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { trackEvent } from "@/components/analytics";
import { courses, courseWithUniversity, formatFee } from "@/data/catalog";

const TENURE_OPTIONS = [6, 12, 18, 24, 36];

export function EmiCalculator() {
  const catalogCourses = useMemo(() => courses.map(courseWithUniversity).sort((a, b) => a.name.localeCompare(b.name)), []);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [fee, setFee] = useState(150000);
  const [tenure, setTenure] = useState(24);
  const trackedUsage = useRef(false);

  const selectedCourse = catalogCourses.find((course) => course.id === selectedCourseId);
  const emi = tenure > 0 ? Math.round(fee / tenure) : 0;

  // Fires once per page view, on the first meaningful interaction, rather than on every
  // keystroke/render -- fee is a live number input, so this is gated to blur/discrete changes.
  function trackUsage(nextFee = fee, nextTenure = tenure, courseId = selectedCourseId) {
    if (trackedUsage.current) return;
    trackedUsage.current = true;
    trackEvent("emi_calculator_used", { course_id: courseId || undefined, fee: nextFee, tenure_months: nextTenure });
  }

  function handleCourseChange(courseId: string) {
    setSelectedCourseId(courseId);
    const course = catalogCourses.find((item) => item.id === courseId);
    if (course) setFee(course.fee);
    trackUsage(course ? course.fee : fee, tenure, courseId);
  }

  return (
    <div className="detail-layout" style={{ paddingTop: 0, paddingBottom: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#363634", marginBottom: 8 }}>
            Pick a program (optional — auto-fills the fee)
          </label>
          <select
            value={selectedCourseId}
            onChange={(event) => handleCourseChange(event.target.value)}
            style={{ width: "100%", height: 44, padding: "0 14px", border: "1px solid #CFDAE6", borderRadius: 4, fontSize: 14, color: "#555", background: "#fff" }}
          >
            <option value="">Enter fee manually</option>
            {catalogCourses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name} — {course.university.shortName} ({formatFee(course.fee)})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#363634", marginBottom: 8 }}>Total program fee</label>
          <input
            type="number"
            min={0}
            step={1000}
            value={fee}
            onChange={(event) => setFee(Math.max(0, Number(event.target.value) || 0))}
            onBlur={() => trackUsage()}
            style={{ width: "100%", height: 44, padding: "0 14px", border: "1px solid #CFDAE6", borderRadius: 4, fontSize: 14, color: "#555", background: "#fff" }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#363634", marginBottom: 8 }}>No-cost EMI tenure</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {TENURE_OPTIONS.map((months) => (
              <button
                key={months}
                type="button"
                onClick={() => {
                  setTenure(months);
                  trackUsage(fee, months);
                }}
                style={{
                  border: `1.5px solid ${tenure === months ? "#544CC8" : "#CFDAE6"}`,
                  background: tenure === months ? "rgba(84,76,200,0.08)" : "#fff",
                  color: tenure === months ? "#544CC8" : "#555",
                  borderRadius: 999,
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {months} months
              </button>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 12, color: "#707070", lineHeight: 1.6 }}>
          This is a simple no-cost EMI estimate (total fee ÷ tenure, 0% interest) matching the EMI structure our listed
          universities publish on their own program pages. Actual EMI approval, processing fees, and available tenures
          depend on the lender and your admission cycle — a counsellor will confirm the exact plan before you pay.
        </div>
      </div>

      <aside className="right-rail">
        <div style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 13, color: "#696868", marginBottom: 6 }}>Estimated EMI</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "#544CC8" }}>{formatFee(emi)}<span style={{ fontSize: 14, color: "#696868", fontWeight: 600 }}>/mo</span></div>
          <div style={{ fontSize: 13, color: "#707070", marginTop: 10 }}>
            {formatFee(fee)} over {tenure} months
          </div>
          {selectedCourse ? (
            <div style={{ fontSize: 12, color: "#707070", marginTop: 10, paddingTop: 10, borderTop: "1px solid #EAEAEA" }}>
              {selectedCourse.name} — {selectedCourse.university.name}
              <br />
              University&apos;s own EMI figure: {selectedCourse.emi}
            </div>
          ) : null}
          <Link
            href={selectedCourse ? `/lead?intent=emi-calculator&course=${selectedCourse.id}` : "/lead?intent=emi-calculator"}
            className="btn primary"
            style={{ width: "100%", height: 44, fontSize: 15, marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
            data-open-lead
          >
            Ask a counsellor to confirm
          </Link>
        </div>
      </aside>
    </div>
  );
}
