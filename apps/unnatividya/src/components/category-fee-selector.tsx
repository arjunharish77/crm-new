"use client";
import Link from "next/link";
import { useId, useState } from "react";
import type { CategoryFees } from "@/data/catalog";
import { formatCategoryFee } from "@/lib/prepared-category-fees";
import { formatCheckedDate } from "@/lib/source-checks";
import { setFeeGroup, useFeeGroup } from "@/components/fee-group";
import { categoryRowFor, type FeeGroup } from "@/lib/fee-group";

// Base tuition per applicant category in the university's own currency (next-phase plan §3).
// Native radios (styled as the design's pills) so the choice works with a keyboard and screen
// readers without extra ARIA.
// Wave 5 E2: it starts on the visitor's fee group, and choosing a category updates that group for
// the rest of the site (an "international" row keeps NRI or foreign as it was).
function groupForRow(row: CategoryFees["rows"][number], current: FeeGroup): FeeGroup {
  if (row.currency === "INR" && /indian/i.test(row.category)) return "indian";
  if (/\bNRI\b|non-resident/i.test(row.category)) return "nri";
  if (/foreign/i.test(row.category)) return "foreign";
  return current === "indian" ? "nri" : current;
}

export function CategoryFeeSelector({ fees, courseId }: { fees: CategoryFees; courseId?: string }) {
  const group = useFeeGroup();
  // A pick holds only while the group it was made under is current; the switch overrides it.
  const [picked, setPicked] = useState<{ index: number; group: FeeGroup } | null>(null);
  const groupRow = categoryRowFor(fees, group);
  const selected = picked && picked.group === group ? picked.index : Math.max(0, groupRow ? fees.rows.indexOf(groupRow) : 0);
  const setSelected = (index: number) => { const next = groupForRow(fees.rows[index], group); setPicked({ index, group: next }); setFeeGroup(next); };
  const name = useId();
  const row = fees.rows[selected] || fees.rows[0];
  return <div className="uvcd-fees">
    <fieldset className="uvcd-fee-options">
      <legend>Fee for</legend>
      <div>
        {fees.rows.map((option, index) => <label key={option.category} className="uvcd-fee-option">
          <input type="radio" name={name} value={option.category} checked={selected === index} onChange={() => setSelected(index)} />
          <span>{option.category}</span>
        </label>)}
      </div>
    </fieldset>
    <dl className="uvcd-fee-result" aria-live="polite">
      <div><dt>Total tuition</dt><dd>{formatCategoryFee(row.currency, row.total)}</dd></div>
      <div><dt>Per semester</dt><dd>{formatCategoryFee(row.currency, row.perSemester)} × {row.semesters}</dd></div>
    </dl>
    {fees.notes?.length ? <ul className="uvcd-fee-notes">{fees.notes.map(note => <li key={note}>{note}</li>)}</ul> : null}
    <p className="uvcd-source">Source: <a href={fees.sourceUrl} target="_blank" rel="noopener noreferrer">{fees.sourceLabel}</a> · checked {formatCheckedDate(fees.checkedAt)}</p>
    {courseId ? <Link href={`/tools/total-cost?course=${encodeURIComponent(courseId)}&category=row-${selected}`} className="uvcd-link">Plan the total cost for this category →</Link> : null}
  </div>;
}
