"use client";
import { useState } from "react";
import { loadPreparedEligibility, internationalApplicantLabel, nriCategoryNote, type PreparedEligibility } from "@/lib/prepared-eligibility";

export function PreparedEligibilityPanel({ draft, content, onChange, disabled }: {
  draft: PreparedEligibility; content: Record<string, unknown>; onChange: (value: string) => void; disabled: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  return <div className="admin-notice admin-span-2">
    <strong>Prepared eligibility correction</strong>
    <p>Source checked {draft.checkedAt}. Review the current admission session and applicant category.</p>
    <a href={draft.sourceUrl} target="_blank" rel="noopener noreferrer">Review official eligibility source</a>
    <details><summary>Preview eligibility correction</summary>
      <h4>Indian applicants</h4><p>{draft.domestic}</p>
      <h4>{internationalApplicantLabel(draft)}</h4><p>{draft.international}</p>
      {draft.foreignApplicantsOnly ? <><h4>NRI applicants</h4><p>{nriCategoryNote}</p></> : null}
      <ul>{draft.notes.map(note => <li key={note}>{note}</li>)}</ul>
    </details>
    <p>Loading replaces eligibility in this unsaved proposal, adds its source and clears the earlier eligibility verification marker. Other edits are retained. It does not save, publish or verify the correction.</p>
    <button type="button" className="btn ghost" disabled={disabled || loaded} onClick={() => {
      onChange(JSON.stringify(loadPreparedEligibility(content, draft), null, 2)); setLoaded(true);
    }}>Load eligibility correction</button>
    {loaded ? <p role="status">Eligibility correction loaded. Review the applicant categories before submitting.</p> : null}
  </div>;
}
