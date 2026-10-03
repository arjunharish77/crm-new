import issues from "@/data/fee-review-issues.json";

export function FeeReviewNotice({ courseId }: { courseId: string }) {
  const issue = issues.find((item) => item.courseId === courseId);
  if (!issue) return null;
  return (
    <aside className="card fee-review-notice" aria-labelledby="fee-review-title">
      <span className="eyebrow">Official-source follow-up</span>
      <h2 id="fee-review-title">{issue.title}</h2>
      <p>Checked <time dateTime={issue.checkedAt}>{issue.checkedAt}</time>. These open findings need editorial review; this notice does not automatically block publication.</p>
      <ul>{issue.notes.map((note) => <li key={note}>{note}</li>)}</ul>
      <a className="text-link" href={issue.sourceUrl} target="_blank" rel="noopener noreferrer">Review official fee source (opens a new tab)</a>
      <p className="admin-muted">Keep confirmed base tuition separate from discounts, instalment estimates and unconfirmed category charges. Resolve findings with dated evidence; attaching source notes alone does not clear them.</p>
    </aside>
  );
}
