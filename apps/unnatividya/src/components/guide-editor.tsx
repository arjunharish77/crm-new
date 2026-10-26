"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CareerScopeContent, EligibilityContent, GuideContent, GuideKind } from "@/lib/guide-cms";

const lines = (value: string) => value.split("\n").map(line => line.trim()).filter(Boolean);

// Wave 5 C3: the CMS guide editor. Saving stores the signed-in editor's own draft; submitting sends
// it to an administrator, who publishes it. An administrator can also publish their own changes in
// one step. Universities are fixed by the guide; the server re-validates everything.
export function GuideEditor({ guideId, kind, initial, initialReason, universityNames, canEdit, canPublish = false, hasDraft, previewHref }: {
  guideId: string; kind: GuideKind; initial: GuideContent; initialReason: string; universityNames: Record<string, string>; canEdit: boolean; canPublish?: boolean; hasDraft: boolean; previewHref?: string;
}) {
  const router = useRouter();
  const [content, setContent] = useState<GuideContent>(initial);
  const [sources, setSources] = useState(initial.sourceUrls.join("\n"));
  const [reason, setReason] = useState(initialReason);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const set = (patch: Partial<EligibilityContent> | Partial<CareerScopeContent>) => setContent(current => ({ ...current, ...patch }) as GuideContent);
  const eligibility = kind === "eligibility" ? content as EligibilityContent : null;
  const career = kind === "career-scope" ? content as CareerScopeContent : null;

  async function call(url: string, method: string, body?: unknown) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "The request failed.");
    return result;
  }
  async function act(work: () => Promise<string>) {
    setBusy(true); setMessage(null);
    try { setMessage({ kind: "ok", text: await work() }); router.refresh(); }
    catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "The request failed." }); }
    finally { setBusy(false); }
  }
  const payload = () => ({ ...content, sourceUrls: lines(sources) });
  const save = () => act(async () => { await call(`/api/admin/guides/${guideId}/draft`, "PUT", { content: payload(), reason }); return "Draft saved. Nothing is published until an administrator applies it."; });
  const submit = () => act(async () => {
    await call(`/api/admin/guides/${guideId}/draft`, "PUT", { content: payload(), reason });
    await call(`/api/admin/guides/${guideId}/draft/submit`, "POST");
    return "Submitted for review.";
  });
  const publish = (form: HTMLFormElement | null) => {
    if (form && !form.reportValidity()) return;
    if (!window.confirm("Publish these changes now? The live guide updates straight away.")) return;
    void act(async () => {
      await call(`/api/admin/guides/${guideId}/draft`, "PUT", { content: payload(), reason });
      await call(`/api/admin/guides/${guideId}/draft/publish`, "POST");
      return "Published. The live guide is updated.";
    });
  };
  const discard = () => { if (window.confirm("Discard your draft? Your saved changes in this draft are removed.")) void act(async () => { await call(`/api/admin/guides/${guideId}/draft`, "DELETE"); return "Draft discarded."; }); };
  const setFaq = (index: number, part: 0 | 1, value: string) => set({ faqs: content.faqs.map((faq, i) => i === index ? (part === 0 ? [value, faq[1]] : [faq[0], value]) : faq) as GuideContent["faqs"] });
  const moveFaq = (index: number, offset: number) => { const faqs = [...content.faqs]; [faqs[index], faqs[index + offset]] = [faqs[index + offset], faqs[index]]; set({ faqs }); };
  const disabled = busy || !canEdit;

  return <form className="article-editor guide-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
    <fieldset className="admin-catalog-fields" disabled={disabled}><legend>{eligibility ? "Eligibility by university" : "Roles and industries by university"}</legend>
      {eligibility ? eligibility.facts.map((fact, index) => <div className="field" key={fact.universityId}>
        <label htmlFor={`guide-fact-${fact.universityId}`}>{universityNames[fact.universityId] || fact.universityId}</label>
        <textarea id={`guide-fact-${fact.universityId}`} rows={3} maxLength={1500} value={fact.fact} onChange={e => set({ facts: eligibility.facts.map((item, i) => i === index ? { ...item, fact: e.target.value } : item) })} />
      </div>) : null}
      {career ? career.universityHighlights.map((item, index) => <div className="editor-row guide-editor-uni" key={item.universityId}>
        <div className="field"><label htmlFor={`guide-roles-${item.universityId}`}>{universityNames[item.universityId] || item.universityId}: roles (one per line)</label>
          <textarea id={`guide-roles-${item.universityId}`} rows={4} value={item.roles.join("\n")} onChange={e => set({ universityHighlights: career.universityHighlights.map((row, i) => i === index ? { ...row, roles: e.target.value.split("\n") } : row) })} onBlur={() => set({ universityHighlights: career.universityHighlights.map((row, i) => i === index ? { ...row, roles: row.roles.map(r => r.trim()).filter(Boolean) } : row) })} /></div>
        <div className="field"><label htmlFor={`guide-industries-${item.universityId}`}>Industries (one per line, optional)</label>
          <textarea id={`guide-industries-${item.universityId}`} rows={4} value={(item.industries || []).join("\n")} onChange={e => set({ universityHighlights: career.universityHighlights.map((row, i) => i === index ? { ...row, industries: e.target.value.split("\n") } : row) })} onBlur={() => set({ universityHighlights: career.universityHighlights.map((row, i) => i === index ? { ...row, industries: (row.industries || []).map(r => r.trim()).filter(Boolean) } : row) })} /></div>
      </div>) : null}
      <div className="field"><label htmlFor="guide-note">{eligibility ? "What's different between universities" : "What we could and couldn't verify"}</label>
        <textarea id="guide-note" rows={4} maxLength={2000} value={eligibility ? eligibility.differentiatorNote : career!.unverifiedClaimsNote} onChange={e => set(eligibility ? { differentiatorNote: e.target.value } : { unverifiedClaimsNote: e.target.value })} /></div>
    </fieldset>

    <fieldset className="admin-catalog-fields" disabled={disabled}><legend>Questions</legend>
      {content.faqs.map((faq, index) => <div className="guide-editor-faq" key={index}>
        <div className="field"><label htmlFor={`guide-q-${index}`}>Question {index + 1}</label><input id={`guide-q-${index}`} maxLength={300} value={faq[0]} onChange={e => setFaq(index, 0, e.target.value)} /></div>
        <div className="field"><label htmlFor={`guide-a-${index}`}>Answer {index + 1}</label><textarea id={`guide-a-${index}`} rows={3} maxLength={2000} value={faq[1]} onChange={e => setFaq(index, 1, e.target.value)} /></div>
        <div className="article-editor-actions">
          <button type="button" className="btn ghost" disabled={index === 0} onClick={() => moveFaq(index, -1)} aria-label={`Move question ${index + 1} up`}>Up</button>
          <button type="button" className="btn ghost" disabled={index === content.faqs.length - 1} onClick={() => moveFaq(index, 1)} aria-label={`Move question ${index + 1} down`}>Down</button>
          <button type="button" className="btn ghost" disabled={content.faqs.length <= 1} onClick={() => set({ faqs: content.faqs.filter((_, i) => i !== index) })} aria-label={`Remove question ${index + 1}`}>Remove</button>
        </div>
      </div>)}
      <button type="button" className="btn ghost" disabled={content.faqs.length >= 12} onClick={() => set({ faqs: [...content.faqs, ["", ""]] })}>Add question</button>
    </fieldset>

    <fieldset className="admin-form-grid admin-catalog-fields" disabled={disabled}><legend>Sources and review</legend>
      <div className="field admin-span-2"><label htmlFor="guide-sources">Official sources (one https:// link per line)</label><textarea id="guide-sources" rows={4} value={sources} onChange={e => setSources(e.target.value)} /></div>
      <div className="field"><label htmlFor="guide-reviewed">Last reviewed</label><input id="guide-reviewed" maxLength={40} value={content.lastReviewed} onChange={e => set({ lastReviewed: e.target.value })} aria-describedby="guide-reviewed-hint" /><small id="guide-reviewed-hint">Shown on the guide, for example &ldquo;October 2026&rdquo;.</small></div>
    </fieldset>

    <fieldset className="admin-catalog-fields" disabled={disabled}><legend>What changed</legend>
      <div className="field"><label htmlFor="guide-reason">What changed and why</label><textarea id="guide-reason" rows={2} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} aria-describedby="guide-reason-hint" /><small id="guide-reason-hint">Required to submit. The reviewer sees this with your changes.</small></div>
    </fieldset>

    {message ? <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "admin-error" : "admin-notice"}>{message.text}</p> : null}
    {canEdit ? <div className="article-editor-actions">
      <button type="submit" className={canPublish ? "btn secondary" : "btn primary"} disabled={busy}>Save draft</button>
      {canPublish ? <button type="button" className="btn primary" disabled={busy} onClick={event => publish(event.currentTarget.form)}>Save and publish</button> : null}
      <button type="button" className="btn secondary" disabled={busy} onClick={() => void submit()}>Save and submit for review</button>
      {hasDraft && previewHref ? <a className="btn ghost" href={previewHref} target="_blank" rel="noopener noreferrer">Preview saved draft</a> : null}
      {hasDraft ? <button type="button" className="btn ghost" disabled={busy} onClick={discard}>Discard draft</button> : null}
    </div> : <p className="admin-notice">Viewers can read guides but not change them.</p>}
  </form>;
}
