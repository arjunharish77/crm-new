"use client";

import { useState } from "react";
import { applicantCategories, applicantLabels, eligibilityRulesSchema, qualificationLabels, qualificationRoutes, type ApplicantCategory, type EligibilityRules } from "@/lib/eligibility-rules";
import { loadPreparedEligibilityRules, type PreparedEligibilityRules } from "@/lib/prepared-eligibility-rules";

export function EligibilityRuleEditor({ content, onChange, disabled, draft }: {
  content: Record<string, unknown>; onChange: (value: string) => void; disabled: boolean; draft?: PreparedEligibilityRules;
}) {
  const [loaded, setLoaded] = useState(false);
  const data = content.data as Record<string, unknown>;
  const raw = data.eligibilityRules;
  const rule = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Partial<EligibilityRules> : undefined;
  const valid = rule ? eligibilityRulesSchema.safeParse(rule).success : false;
  const update = (next: Record<string, unknown> | null) => {
    const nextData = { ...data };
    if (next) nextData.eligibilityRules = next;
    else delete nextData.eligibilityRules;
    onChange(JSON.stringify({ ...content, data: nextData }, null, 2));
  };
  const edit = (key: string, value: unknown) => update({ ...rule, [key]: value });
  const categories = rule?.categories && typeof rule.categories === "object" ? rule.categories : {};
  const editCategory = (key: ApplicantCategory, field: "minimum" | "reservedMinimum", value: number | null) => {
    const row = categories[key] || { minimum: null, reservedMinimum: null };
    edit("categories", { ...categories, [key]: { ...row, [field]: value } });
  };
  return <fieldset className="admin-form-grid admin-catalog-fields"><legend>Structured eligibility checker rules</legend>
    <p className="admin-span-2">Only published rules drive the public checker. Record exact applicant categories, qualification routes and marks from the official program source; leave unresolved conditions as confirmation items. Changing the eligibility paragraph above removes these rules so a stale rule cannot contradict it. Saving this form is private until an administrator applies a reviewed revision.</p>
    {draft ? <div className="admin-notice admin-span-2">
      <strong>Prepared {draft.courseId.toUpperCase()} checker rule pilot</strong>
      <p>Checked {draft.rules.checkedAt}. The rule records {draft.rules.acceptedRoutes.length} accepted route{draft.rules.acceptedRoutes.length === 1 ? "" : "s"} and category-specific marks. Review the current intake and source before submitting.</p>
      <a href={draft.rules.sourceUrl} target="_blank" rel="noopener noreferrer">Open official program eligibility</a>
      <ul>{draft.rules.notes.map(note => <li key={note}>{note}</li>)}</ul>
      <button type="button" className="btn ghost" disabled={disabled || loaded} onClick={() => { onChange(JSON.stringify(loadPreparedEligibilityRules(content, draft), null, 2)); setLoaded(true); }}>Load prepared checker rules</button>
      {loaded ? <p role="status">Rules loaded into the unsaved proposal. Check each field below before submitting.</p> : null}
    </div> : null}
    {raw && !rule ? <p role="alert" className="admin-error admin-span-2">The rule has an unsupported structure. Repair it in Advanced structured content.</p> : null}
    {!rule ? <div className="admin-span-2"><button type="button" className="btn ghost" disabled={disabled} onClick={() => update({ checkedAt: "", sourceUrl: "", sessionLabel: "", acceptedRoutes: [], requiresBachelorDegree: false, academicCriteriaComplete: false, categories: {}, requiresAiuForEducationOutsideIndia: false, unresolvedAcademicConditions: [], notes: [] })}>Add structured rules</button></div> : <>
      <p className="admin-span-2" role="status">{valid ? "Rule structure is complete. Verify its claims against the linked source before submission." : "Rule is incomplete. Fill every required source and category field before submitting for publication."}</p>
      <div className="field"><label htmlFor="rule-check-date">Source checked</label><input id="rule-check-date" type="date" value={rule.checkedAt || ""} disabled={disabled} onChange={event => edit("checkedAt", event.target.value)} /></div>
      <div className="field"><label htmlFor="rule-session">Admission session or source scope</label><input id="rule-session" value={rule.sessionLabel || ""} disabled={disabled} onChange={event => edit("sessionLabel", event.target.value)} /></div>
      <div className="field admin-span-2"><label htmlFor="rule-source">Official program eligibility URL</label><input id="rule-source" type="url" value={rule.sourceUrl || ""} disabled={disabled} onChange={event => edit("sourceUrl", event.target.value)} /></div>
      <fieldset className="admin-span-2"><legend>Accepted qualification routes</legend><div className="eligibility-rule-options">{qualificationRoutes.map(route => <label key={route}><input type="checkbox" checked={rule.acceptedRoutes?.includes(route) || false} disabled={disabled} onChange={event => edit("acceptedRoutes", event.target.checked ? [...(rule.acceptedRoutes || []), route] : (rule.acceptedRoutes || []).filter(item => item !== route))} />{qualificationLabels[route]}</label>)}</div></fieldset>
      <label className="admin-span-2 eligibility-rule-check"><input type="checkbox" checked={rule.requiresBachelorDegree || false} disabled={disabled} onChange={event => edit("requiresBachelorDegree", event.target.checked)} />A completed bachelor&apos;s degree is required</label>
      <label className="admin-span-2 eligibility-rule-check"><input type="checkbox" checked={rule.academicCriteriaComplete || false} disabled={disabled} onChange={event => edit("academicCriteriaComplete", event.target.checked)} />I checked every academic condition needed for “Matches” on the categories and routes encoded below. Unlisted categories and routes still return “Needs university confirmation”.</label>
      {applicantCategories.map(category => {
        const row = categories[category];
        return <fieldset className="admin-span-2 admin-form-grid" key={category}><legend>{applicantLabels[category]}</legend>
          <label className="eligibility-rule-check"><input type="checkbox" checked={Boolean(row)} disabled={disabled} onChange={event => edit("categories", { ...categories, [category]: event.target.checked ? { minimum: null, reservedMinimum: null } : undefined })} />Published criteria for this category</label>
          {row ? <><div className="field"><label htmlFor={`rule-min-${category}`}>Minimum qualifying marks (%)</label><input id={`rule-min-${category}`} type="number" min="0" max="100" step="0.01" value={row.minimum ?? ""} disabled={disabled} onChange={event => editCategory(category, "minimum", event.target.value === "" ? null : Number(event.target.value))} /><small>Leave blank only if the source gives no minimum.</small></div>
          <div className="field"><label htmlFor={`rule-reserved-${category}`}>Reserved-category minimum (%)</label><input id={`rule-reserved-${category}`} type="number" min="0" max="100" step="0.01" value={row.reservedMinimum ?? ""} disabled={disabled} onChange={event => editCategory(category, "reservedMinimum", event.target.value === "" ? null : Number(event.target.value))} /><small>Leave blank if no separate threshold is published.</small></div></> : null}
          {row ? <div className="admin-span-2"><p>Qualification routes for this applicant category</p><div className="eligibility-rule-options">{qualificationRoutes.map(route => <label key={route}><input type="checkbox" checked={(row.acceptedRoutes || rule.acceptedRoutes || []).includes(route)} disabled={disabled} onChange={event => { const current = row.acceptedRoutes || rule.acceptedRoutes || []; const next = event.target.checked ? [...current, route] : current.filter(item => item !== route); edit("categories", { ...categories, [category]: { ...row, acceptedRoutes: next } }); }} />{qualificationLabels[route]}</label>)}</div><small>Changing these overrides the shared routes for this category.</small></div> : null}
        </fieldset>;
      })}
      <label className="admin-span-2 eligibility-rule-check"><input type="checkbox" checked={rule.requiresAiuForEducationOutsideIndia || false} disabled={disabled} onChange={event => edit("requiresAiuForEducationOutsideIndia", event.target.checked)} />AIU equivalence is required for qualifying education completed outside India</label>
      <div className="field admin-span-2"><label htmlFor="rule-unresolved">Unresolved academic conditions, one per line</label><textarea id="rule-unresolved" rows={3} value={(rule.unresolvedAcademicConditions || []).join("\n")} disabled={disabled} onChange={event => edit("unresolvedAcademicConditions", event.target.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean))} /><small>Any condition here makes the checker return “Needs confirmation.”</small></div>
      <div className="field admin-span-2"><label htmlFor="rule-notes">Reviewer notes, one per line</label><textarea id="rule-notes" rows={3} value={(rule.notes || []).join("\n")} disabled={disabled} onChange={event => edit("notes", event.target.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean))} /></div>
      <div className="admin-span-2"><button type="button" className="btn ghost" disabled={disabled} onClick={() => update(null)}>Remove checker rules from proposal</button></div>
    </>}
  </fieldset>;
}
