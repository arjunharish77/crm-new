import Link from "next/link";
import { ArrowRight, CircleCheck, Sparkles } from "lucide-react";

// Course detail sticky sidebar (design Course "sidebar"). One Apply now (CTA rule), no phone,
// and a "Why learners pick" list built only from published or owner-stated figures, each
// labelled with its scope.
export function CourseEnquiryCard({ courseId, feeLabel, fee, emi, universityShortName, reasons }: {
  courseId: string;
  feeLabel: React.ReactNode;
  fee: React.ReactNode;
  emi: React.ReactNode;
  universityShortName: string;
  reasons: string[];
}) {
  return <aside className="uvcd-rail" aria-label="Fees and application">
    <div className="uvcd-rail-card">
      <p className="uvcd-rail-label">{feeLabel}</p>
      <p className="uvcd-rail-fee">{fee}</p>
      {emi}
      <div className="uvcd-rail-actions">
        <Link href={`/lead?course=${encodeURIComponent(courseId)}&intent=apply_now`} rel="nofollow" className="btn primary course-rail-action" data-open-lead>Apply now</Link>
        <Link href={`/compare?add=${encodeURIComponent(courseId)}`} className="btn secondary course-rail-action">Compare with similar programs</Link>
      </div>
      {reasons.length ? <div className="uvcd-rail-why">
        <h2>Why learners pick {universityShortName}</h2>
        <ul>{reasons.map(reason => <li key={reason}><CircleCheck size={18} aria-hidden="true" />{reason}</li>)}</ul>
      </div> : null}
      <p className="uvcd-rail-note">Submitting an enquiry does not confirm university admission.</p>
    </div>
    <div className="uvcd-rail-fit">
      <Sparkles size={28} aria-hidden="true" />
      <div>
        <p><b>Not sure this is the one?</b></p>
        <p>Answer a few questions to explore matches.</p>
        <Link href="/recommender" className="uvcd-link">Find my course<ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    </div>
  </aside>;
}
