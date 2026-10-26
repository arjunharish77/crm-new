"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BlogBlock } from "@/data/blog";
import type { ArticleContent } from "@/lib/article-content";

const CATEGORIES = ["Validity", "Fees & EMI", "Careers", "Admissions"] as const;
const BLOCK_LABELS: Record<BlogBlock["type"], string> = { p: "Paragraph", h2: "Section heading", note: "Tip box", image: "Image", links: "Link box" };
const blankBlock = (type: BlogBlock["type"]): BlogBlock => type === "image" ? { type, src: "", alt: "" } : type === "links" ? { type, heading: "", items: [{ href: "", label: "" }] } : { type, text: "" };

// The CMS article editor (decision 8). Saving stores the signed-in editor's own draft; submitting
// sends it to an administrator, who publishes it. An administrator can also publish their own
// changes in one step. The server re-validates everything.
export function ArticleEditor({ articleId, slug, initial, initialReason, canEdit, canPublish = false, hasDraft, previewHref }: {
  articleId?: string; slug?: string; initial: ArticleContent; initialReason: string; canEdit: boolean; canPublish?: boolean; hasDraft: boolean; previewHref?: string;
}) {
  const router = useRouter();
  const [content, setContent] = useState<ArticleContent>(initial);
  const [newSlug, setNewSlug] = useState(slug || "");
  const [reason, setReason] = useState(initialReason);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const set = <K extends keyof ArticleContent>(key: K, value: ArticleContent[K]) => setContent(current => ({ ...current, [key]: value }));
  const setBlock = (index: number, block: BlogBlock) => set("body", content.body.map((item, i) => i === index ? block : item));
  const move = (index: number, offset: number) => { const body = [...content.body]; [body[index], body[index + offset]] = [body[index + offset], body[index]]; set("body", body); };

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
  const payload = () => ({ ...content, updatedDate: content.updatedDate || undefined, sources: content.sources?.length ? content.sources : undefined });
  const save = () => act(async () => {
    if (!articleId) {
      const created = await call("/api/admin/articles", "POST", { slug: newSlug, content: payload(), reason });
      router.push(`/admin/articles/${created.articleId}`);
      return "Article created as a draft.";
    }
    await call(`/api/admin/articles/${articleId}/draft`, "PUT", { content: payload(), reason });
    return "Draft saved. Nothing is published until an administrator applies it.";
  });
  const submit = () => act(async () => {
    await call(`/api/admin/articles/${articleId}/draft`, "PUT", { content: payload(), reason });
    await call(`/api/admin/articles/${articleId}/draft/submit`, "POST");
    return "Submitted for review.";
  });
  const publish = (form: HTMLFormElement | null) => {
    if (form && !form.reportValidity()) return;
    if (!window.confirm(articleId ? "Publish these changes now? The live article updates straight away." : "Create and publish this article now? It goes live straight away.")) return;
    void act(async () => {
      if (articleId) await call(`/api/admin/articles/${articleId}/draft`, "PUT", { content: payload(), reason });
      const id = articleId || (await call("/api/admin/articles", "POST", { slug: newSlug, content: payload(), reason })).articleId;
      try { await call(`/api/admin/articles/${id}/draft/publish`, "POST"); }
      catch (error) {
        if (articleId) throw error;
        router.push(`/admin/articles/${id}`);
        throw new Error(`The article was created as a draft but not published: ${error instanceof Error ? error.message : "the request failed."}`);
      }
      if (!articleId) router.push(`/admin/articles/${id}`);
      return "Published. The live article is updated.";
    });
  };
  const discard = () => { if (window.confirm("Discard your draft? Your unsaved and saved changes in this draft are removed.")) void act(async () => { await call(`/api/admin/articles/${articleId}/draft`, "DELETE"); return "Draft discarded."; }); };

  const disabled = busy || !canEdit;
  return <form className="article-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
    <fieldset className="admin-form-grid admin-catalog-fields" disabled={disabled}><legend>Article</legend>
      {!articleId ? <div className="field"><label htmlFor="article-slug">URL</label><input id="article-slug" required value={newSlug} onChange={e => setNewSlug(e.target.value.toLowerCase())} aria-describedby="article-slug-hint" /><small id="article-slug-hint">/blog/{newSlug || "your-article"}: lower-case words joined by hyphens. It can&apos;t change after publishing.</small></div> : null}
      <div className="field admin-span-2"><label htmlFor="article-title">Title</label><input id="article-title" required maxLength={120} value={content.title} onChange={e => set("title", e.target.value)} aria-describedby="article-title-hint" /><small id="article-title-hint">{content.title.length}/120. Up to about 60 characters shows in full in search results.</small></div>
      <div className="field"><label htmlFor="article-category">Category</label><select id="article-category" value={content.category} onChange={e => set("category", e.target.value as ArticleContent["category"])}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
      <div className="field"><label htmlFor="article-cover">Cover image</label><input id="article-cover" required value={content.cover} onChange={e => set("cover", e.target.value)} placeholder="/blog/name.webp" /></div>
      <div className="field admin-span-2"><label htmlFor="article-excerpt">Summary</label><textarea id="article-excerpt" required maxLength={300} rows={2} value={content.excerpt} onChange={e => set("excerpt", e.target.value)} aria-describedby="article-excerpt-hint" /><small id="article-excerpt-hint">Answer the reader&apos;s question in the first sentence. Shown under the title and in search results.</small></div>
      <div className="field"><label htmlFor="article-published">Published on</label><input id="article-published" type="date" required value={content.publishedDate} onChange={e => set("publishedDate", e.target.value)} /></div>
      <div className="field"><label htmlFor="article-updated">Updated on</label><input id="article-updated" type="date" value={content.updatedDate || ""} onChange={e => set("updatedDate", e.target.value || undefined)} aria-describedby="article-updated-hint" /><small id="article-updated-hint">Set only when a fact or the advice changes, not for typo fixes.</small></div>
    </fieldset>

    <fieldset className="admin-catalog-fields article-editor-blocks" disabled={disabled}><legend>Body</legend>
      {content.body.map((block, index) => <div className="article-editor-block" key={index}>
        <div className="article-editor-block-head"><strong>{index + 1}. {BLOCK_LABELS[block.type]}</strong>
          <span><button type="button" className="btn ghost" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move block ${index + 1} up`}>↑</button>
          <button type="button" className="btn ghost" onClick={() => move(index, 1)} disabled={index === content.body.length - 1} aria-label={`Move block ${index + 1} down`}>↓</button>
          <button type="button" className="btn ghost" onClick={() => set("body", content.body.filter((_, i) => i !== index))} aria-label={`Remove block ${index + 1}`}>Remove</button></span></div>
        {block.type === "image" ? <div className="admin-form-grid">
          <div className="field"><label htmlFor={`block-${index}-src`}>Image path</label><input id={`block-${index}-src`} value={block.src} onChange={e => setBlock(index, { ...block, src: e.target.value })} placeholder="/blog/name.webp" /></div>
          <div className="field"><label htmlFor={`block-${index}-alt`}>Description for screen readers</label><input id={`block-${index}-alt`} value={block.alt} onChange={e => setBlock(index, { ...block, alt: e.target.value })} /></div>
        </div> : block.type === "links" ? <div className="admin-form-grid">
          <div className="field admin-span-2"><label htmlFor={`block-${index}-heading`}>Box heading</label><input id={`block-${index}-heading`} value={block.heading} onChange={e => setBlock(index, { ...block, heading: e.target.value })} /></div>
          {block.items.map((item, i) => <div className="editor-row admin-span-2" key={i}>
            <div className="field"><label htmlFor={`block-${index}-label-${i}`}>Link text {i + 1}</label><input id={`block-${index}-label-${i}`} value={item.label} onChange={e => setBlock(index, { ...block, items: block.items.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} /></div>
            <div className="field"><label htmlFor={`block-${index}-href-${i}`}>Link {i + 1}</label><input id={`block-${index}-href-${i}`} value={item.href} onChange={e => setBlock(index, { ...block, items: block.items.map((x, j) => j === i ? { ...x, href: e.target.value } : x) })} placeholder="/courses/… or https://…" /></div>
            <button type="button" className="btn ghost" onClick={() => setBlock(index, { ...block, items: block.items.filter((_, j) => j !== i) })} aria-label={`Remove link ${i + 1}`}>Remove</button>
          </div>)}
          <button type="button" className="btn ghost" onClick={() => setBlock(index, { ...block, items: [...block.items, { href: "", label: "" }] })}>Add link</button>
        </div> : <div className="field"><label htmlFor={`block-${index}-text`} className="sr-only">{BLOCK_LABELS[block.type]} {index + 1}</label>
          <textarea id={`block-${index}-text`} rows={block.type === "h2" ? 1 : 4} value={block.text} onChange={e => setBlock(index, { ...block, text: e.target.value })} /></div>}
      </div>)}
      <div className="article-editor-add">{(Object.keys(BLOCK_LABELS) as BlogBlock["type"][]).map(type => <button type="button" className="btn ghost" key={type} onClick={() => set("body", [...content.body, blankBlock(type)])}>Add {BLOCK_LABELS[type].toLowerCase()}</button>)}</div>
    </fieldset>

    <fieldset className="admin-catalog-fields" disabled={disabled}><legend>Questions and answers</legend>
      {content.faqs.map(([question, answer], index) => <div className="editor-row" key={index}>
        <div className="field"><label htmlFor={`faq-${index}-q`}>Question {index + 1}</label><input id={`faq-${index}-q`} value={question} onChange={e => set("faqs", content.faqs.map((row, i) => i === index ? [e.target.value, row[1]] : row))} /></div>
        <div className="field"><label htmlFor={`faq-${index}-a`}>Answer {index + 1}</label><textarea id={`faq-${index}-a`} rows={2} value={answer} onChange={e => set("faqs", content.faqs.map((row, i) => i === index ? [row[0], e.target.value] : row))} /></div>
        <button type="button" className="btn ghost" onClick={() => set("faqs", content.faqs.filter((_, i) => i !== index))} aria-label={`Remove question ${index + 1}`}>Remove</button>
      </div>)}
      <button type="button" className="btn ghost" onClick={() => set("faqs", [...content.faqs, ["", ""]])}>Add question</button>
    </fieldset>

    <fieldset className="admin-catalog-fields" disabled={disabled}><legend>Sources</legend>
      <p>Official pages only (university, UGC-DEB, AIU, NAAC). Each source is listed beside the article with the date you checked it.</p>
      {(content.sources || []).map((source, index) => <div className="editor-row" key={index}>
        <div className="field"><label htmlFor={`source-${index}-label`}>Source {index + 1}</label><input id={`source-${index}-label`} value={source.label} onChange={e => set("sources", (content.sources || []).map((row, i) => i === index ? { ...row, label: e.target.value } : row))} /></div>
        <div className="field"><label htmlFor={`source-${index}-url`}>Link {index + 1}</label><input id={`source-${index}-url`} type="url" value={source.url} onChange={e => set("sources", (content.sources || []).map((row, i) => i === index ? { ...row, url: e.target.value } : row))} placeholder="https://…" /></div>
        <div className="field"><label htmlFor={`source-${index}-checked`}>Checked on {index + 1}</label><input id={`source-${index}-checked`} type="date" value={source.checkedAt} onChange={e => set("sources", (content.sources || []).map((row, i) => i === index ? { ...row, checkedAt: e.target.value } : row))} /></div>
        <button type="button" className="btn ghost" onClick={() => set("sources", (content.sources || []).filter((_, i) => i !== index))} aria-label={`Remove source ${index + 1}`}>Remove</button>
      </div>)}
      <button type="button" className="btn ghost" onClick={() => set("sources", [...(content.sources || []), { label: "", url: "", checkedAt: new Date().toISOString().slice(0, 10) }])}>Add source</button>
    </fieldset>

    <fieldset className="admin-catalog-fields" disabled={disabled}><legend>What changed</legend>
      <div className="field"><label htmlFor="article-reason">What changed and why</label><textarea id="article-reason" rows={2} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} aria-describedby="article-reason-hint" /><small id="article-reason-hint">Required to submit. The reviewer sees this with your changes.</small></div>
    </fieldset>

    {message ? <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "admin-error" : "admin-notice"}>{message.text}</p> : null}
    {canEdit ? <div className="article-editor-actions">
      <button type="submit" className={canPublish ? "btn secondary" : "btn primary"} disabled={busy}>{articleId ? "Save draft" : "Create draft"}</button>
      {canPublish ? <button type="button" className="btn primary" disabled={busy} onClick={event => publish(event.currentTarget.form)}>{articleId ? "Save and publish" : "Create and publish"}</button> : null}
      {articleId ? <button type="button" className="btn secondary" disabled={busy} onClick={() => void submit()}>Save and submit for review</button> : null}
      {articleId && hasDraft && previewHref ? <a className="btn ghost" href={previewHref} target="_blank" rel="noopener noreferrer">Preview saved draft</a> : null}
      {articleId && hasDraft ? <button type="button" className="btn ghost" disabled={busy} onClick={discard}>Discard draft</button> : null}
    </div> : <p className="admin-notice">Viewers can read articles but not change them.</p>}
  </form>;
}
