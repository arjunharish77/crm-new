import type { ReactNode } from "react";
import { CircleQuestionMark, Minus, Plus } from "lucide-react";

// Shared FAQ accordion (design UVFaq): two columns of bordered cards. Built on native
// <details name> so it works without JavaScript, stays keyboard accessible, opens one item at a
// time and keeps every answer in the HTML (matching the page's FAQPage structured data).
export function FaqAccordion({ items, name, title = "Frequently asked questions", subtitle = "Get quick answers to common questions about online degrees.", id = "sec-faq", headingLevel = 2 }: {
  items: Array<[string, ReactNode]>;
  name: string;
  title?: string;
  subtitle?: string | null;
  id?: string;
  headingLevel?: 2 | 3;
}) {
  if (!items.length) return null;
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const half = Math.ceil(items.length / 2);
  const columns = [items.slice(0, half), items.slice(half)].filter(column => column.length);
  return <section className="uv-faq" id={id} aria-labelledby={`${id}-title`} tabIndex={-1}>
    <div className="uv-faq-head">
      <div>
        <Heading id={`${id}-title`} className="uv-faq-title">{title}</Heading>
        {subtitle ? <p className="uv-faq-sub">{subtitle}</p> : null}
      </div>
    </div>
    <div className="uv-faq-cols">
      {columns.map((column, c) => <div className="uv-faq-col" key={c}>
        {column.map(([question, answer]) => <details className="uv-faq-item" name={name} key={question}>
          <summary>
            <CircleQuestionMark size={20} className="uv-faq-q" aria-hidden="true" />
            <span>{question}</span>
            <Plus size={22} className="uv-faq-plus" aria-hidden="true" />
            <Minus size={22} className="uv-faq-minus" aria-hidden="true" />
          </summary>
          <div className="uv-faq-answer">{answer}</div>
        </details>)}
      </div>)}
    </div>
  </section>;
}
