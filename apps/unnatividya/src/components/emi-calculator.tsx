"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { trackEvent } from "@/components/analytics";
import { courses, courseWithUniversity, formatFee } from "@/data/catalog";

export function EmiCalculator() {
  const catalogCourses = useMemo(() => courses.map(courseWithUniversity).sort((a, b) => a.name.localeCompare(b.name)), []);
  const cheapestByEmi = useMemo(
    () =>
      [...catalogCourses]
        .sort((a, b) => Number(a.emi.replace(/\D/g, "")) - Number(b.emi.replace(/\D/g, "")))
        .slice(0, 4),
    [catalogCourses],
  );

  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [fee, setFee] = useState(180000);
  const [down, setDown] = useState(20000);
  const [months, setMonths] = useState(24);
  const [rate, setRate] = useState(0);
  const trackedUsage = useRef(false);

  const selectedCourse = catalogCourses.find((course) => course.id === selectedCourseId);
  const principal = Math.max(0, fee - down);
  const monthlyRate = rate / 1200;
  const rawEmi =
    monthlyRate === 0
      ? principal / months
      : (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
  // formatFee() doesn't round (catalog fees are always whole rupees already) -- the amortization
  // formula produces fractional rupees, so round each displayed figure explicitly, same as the
  // design's own reference `money()` helper does.
  const emi = Math.round(rawEmi);
  const total = Math.round(rawEmi * months);
  const totalInterest = total - principal;

  // Fires once per page view, on the first meaningful slider release/course pick, rather than
  // on every drag step -- range inputs fire onChange continuously while dragging in most
  // browsers, so this is gated to mouseup/touchend/blur, matching the pattern already used for
  // the fee-range slider in course-explorer.tsx.
  function trackUsage(courseId = selectedCourseId) {
    if (trackedUsage.current) return;
    trackedUsage.current = true;
    trackEvent("emi_calculator_used", { course_id: courseId || undefined, fee, tenure_months: months });
  }

  // Unlike trackUsage() above (fires once per page view, just to mark engagement),
  // this fires on every slider release -- capturing the actual fee/tenure/rate combinations
  // visitors explore, which trackUsage()'s single first-touch snapshot can't show.
  function trackCalculation() {
    trackEvent("emi_calculation", { fee, down_payment: down, tenure_months: months, rate, emi, total_interest: totalInterest });
  }

  function handleCourseChange(courseId: string) {
    setSelectedCourseId(courseId);
    const course = catalogCourses.find((item) => item.id === courseId);
    if (course) {
      setFee(course.fee);
      setMonths(course.duration.startsWith("36") ? 36 : 24);
    }
    trackUsage(courseId);
    // Not calling trackCalculation() here: fee/months were just updated via setFee/setMonths
    // above in this same synchronous handler, so it would read stale pre-update values from this
    // render's closure. The slider release handlers below don't have that problem -- onChange has
    // already committed a re-render by the time a separate mouseup/touchend event fires.
  }

  const sliderLabelStyle = { fontSize: 12, fontWeight: 700, color: "#363634", letterSpacing: "0.4px" as const };
  const sliderValueStyle = { fontSize: 18, fontWeight: 700, color: "#363634" };

  return (
    <div className="emi-layout">
      <div style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 28 }}>
        <label htmlFor="emi-course" style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#363634", letterSpacing: "0.4px", marginBottom: 10 }}>
          PICK A PROGRAM
        </label>
        <select
          id="emi-course"
          value={selectedCourseId}
          onChange={(event) => handleCourseChange(event.target.value)}
          style={{ width: "100%", height: 48, padding: "0 14px", border: "1px solid #CFDAE6", borderRadius: 4, fontSize: 14, color: "#555", background: "#fff", marginBottom: 24 }}
        >
          <option value="">Enter fee manually</option>
          {catalogCourses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name} — {course.university.shortName} · {formatFee(course.fee)}
            </option>
          ))}
        </select>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <label htmlFor="emi-fee" style={sliderLabelStyle}>TOTAL PROGRAM FEE</label>
          <span style={sliderValueStyle}>{formatFee(fee)}</span>
        </div>
        <input
          id="emi-fee"
          type="range"
          min={50000}
          max={300000}
          step={5000}
          value={fee}
          onChange={(event) => setFee(Number(event.target.value))}
          onMouseUp={() => { trackUsage(); trackCalculation(); }}
          onTouchEnd={() => { trackUsage(); trackCalculation(); }}
          style={{ width: "100%", accentColor: "#544CC8", marginBottom: 24 }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <label htmlFor="emi-down" style={sliderLabelStyle}>DOWN PAYMENT</label>
          <span style={sliderValueStyle}>{formatFee(down)}</span>
        </div>
        <input
          id="emi-down"
          type="range"
          min={0}
          max={150000}
          step={5000}
          value={down}
          onChange={(event) => setDown(Number(event.target.value))}
          onMouseUp={() => { trackUsage(); trackCalculation(); }}
          onTouchEnd={() => { trackUsage(); trackCalculation(); }}
          style={{ width: "100%", accentColor: "#544CC8", marginBottom: 24 }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <label htmlFor="emi-tenure" style={sliderLabelStyle}>TENURE</label>
          <span style={sliderValueStyle}>{months} months</span>
        </div>
        <input
          id="emi-tenure"
          type="range"
          min={6}
          max={48}
          step={3}
          value={months}
          onChange={(event) => setMonths(Number(event.target.value))}
          onMouseUp={() => { trackUsage(); trackCalculation(); }}
          onTouchEnd={() => { trackUsage(); trackCalculation(); }}
          style={{ width: "100%", accentColor: "#544CC8", marginBottom: 24 }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <label htmlFor="emi-rate" style={sliderLabelStyle}>INTEREST RATE (ANNUAL)</label>
          <span style={sliderValueStyle}>{rate === 0 ? "0% (no-cost)" : `${rate}%`}</span>
        </div>
        <input
          id="emi-rate"
          type="range"
          min={0}
          max={16}
          step={0.5}
          value={rate}
          onChange={(event) => setRate(Number(event.target.value))}
          onMouseUp={() => { trackUsage(); trackCalculation(); }}
          onTouchEnd={() => { trackUsage(); trackCalculation(); }}
          style={{ width: "100%", accentColor: "#544CC8" }}
        />
        <div style={{ fontSize: 12, color: "#707070", marginTop: 8, lineHeight: 1.6 }}>
          Set 0% to model the no-cost EMI plans universities offer through finance partners. Actual EMI approval,
          processing fees, and available tenures depend on the lender and your admission cycle — a counsellor will
          confirm the exact plan before you pay.
        </div>
      </div>

      <aside className="right-rail">
        <div style={{ background: "#263238", borderRadius: 8, padding: 26, color: "#fff" }}>
          <div style={{ fontSize: 13, color: "#B8C4CA" }}>Your monthly EMI</div>
          <div style={{ fontSize: 38, fontWeight: 700, margin: "6px 0 2px", letterSpacing: "-0.8px" }}>{formatFee(emi)}</div>
          <div style={{ fontSize: 13, color: "#B8C4CA" }}>for {months} months</div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.12)", margin: "18px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0" }}>
            <span style={{ color: "#B8C4CA" }}>Loan amount</span>
            <span style={{ fontWeight: 700 }}>{formatFee(principal)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0" }}>
            <span style={{ color: "#B8C4CA" }}>Total interest</span>
            <span style={{ fontWeight: 700 }}>{formatFee(totalInterest)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0" }}>
            <span style={{ color: "#B8C4CA" }}>Total payable</span>
            <span style={{ fontWeight: 700 }}>{formatFee(total)}</span>
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 22 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#363634" }}>Get the exact loan terms</div>
          <div style={{ fontSize: 13, color: "#696868", margin: "7px 0 14px", lineHeight: 1.55 }}>
            A counsellor shares approved partner rates, processing fees and eligibility for your program.
          </div>
          <Link
            href={selectedCourse ? `/lead?intent=emi-calculator&course=${selectedCourse.id}` : "/lead?intent=emi-calculator"}
            className="btn primary"
            style={{ width: "100%", height: 46, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}
            data-open-lead
          >
            Talk to a counsellor
          </Link>
        </div>

        <div style={{ background: "#F4F3FC", border: "1px solid #CFDAE6", borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#363634", marginBottom: 8 }}>Cheapest programs by EMI</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cheapestByEmi.map((course) => (
              <Link
                key={course.id}
                href={`/courses/${course.slug}`}
                style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#555" }}
              >
                <span>{course.name} · {course.university.shortName}</span>
                <b style={{ color: "#544CC8" }}>{course.emi}</b>
              </Link>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
