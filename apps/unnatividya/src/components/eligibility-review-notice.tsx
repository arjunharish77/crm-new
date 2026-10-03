export type EligibilityReviewIssue = {
  courseId: string; checkedAt: string; title: string; summary: string; requiredReview: string;
  sources: { label: string; url: string }[];
};

export function EligibilityReviewNotice({ issue }: { issue: EligibilityReviewIssue }) {
  return <aside className="admin-notice" aria-labelledby="eligibility-review-title">
    <h2 id="eligibility-review-title">Eligibility evidence needs review</h2>
    <strong>{issue.title}</strong>
    <p>Evidence checked {issue.checkedAt}. {issue.summary}</p>
    <p>{issue.requiredReview}</p>
    <ul>{issue.sources.map(source => <li key={source.url}>
      <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>
    </li>)}</ul>
    <p>No prepared eligibility correction is available for this record. Manual proposals remain available for confirmed information; include the supporting source and admission session in your review reason.</p>
  </aside>;
}
