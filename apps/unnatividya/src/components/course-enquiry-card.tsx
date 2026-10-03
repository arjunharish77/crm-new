import Link from "next/link";

export function CourseEnquiryCard({ courseId }: { courseId: string }) {
  return <aside className="course-apply-card">
    <h2>Start your application enquiry</h2>
    <p>Share your contact details, then choose your course and optional university preference.</p>
    <Link href={`/lead?course=${encodeURIComponent(courseId)}&intent=apply_now`} className="btn primary" data-open-lead>Apply now</Link>
    <p className="lead-help">Our team will follow up. Submitting an enquiry does not confirm university admission.</p>
  </aside>;
}
