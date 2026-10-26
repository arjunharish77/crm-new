import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, CircleCheck, MailX } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : "";
  const id = typeof params.id === "string" ? params.id.slice(0, 40) : "";
  const token = typeof params.token === "string" ? params.token.slice(0, 100) : "";
  const state = status === "done" ? "done" : status === "invalid" || !id || !token ? "invalid" : "ask";
  const Icon = state === "done" ? CircleCheck : state === "invalid" ? CircleAlert : MailX;
  return <section className="uv-status-page newsletter-page" aria-labelledby="newsletter-title">
    <div className="uv-status-card">
      <span className={`uv-status-icon is-${state === "done" ? "success" : state === "invalid" ? "warning" : "primary"}`} aria-hidden="true"><Icon size={32} /></span>
      {state === "done" ? <>
        <h1 id="newsletter-title">You&apos;re unsubscribed</h1>
        <p>You won&apos;t receive Unnati Vidya&apos;s newsletter or WhatsApp updates. If you have an open enquiry, our team may still contact you about it.</p>
      </> : state === "invalid" ? <>
        <h1 id="newsletter-title">This unsubscribe link isn&apos;t valid</h1>
        <p>Use the link from one of our emails, or write to <a href="mailto:admin@unnatividya.com">admin@unnatividya.com</a> and we&apos;ll remove you.</p>
      </> : <>
        <h1 id="newsletter-title">Unsubscribe from Unnati Vidya updates</h1>
        <p>This stops the newsletter and WhatsApp updates. It doesn&apos;t cancel an enquiry you&apos;ve made.</p>
        <form method="post" action="/api/newsletter/unsubscribe"><input type="hidden" name="id" value={id} /><input type="hidden" name="token" value={token} /><button type="submit" className="btn primary large">Unsubscribe</button></form>
      </>}
      <nav aria-label="Explore from here" className="uv-status-links"><Link href="/courses">Browse courses</Link><Link href="/">Go to homepage</Link></nav>
    </div>
  </section>;
}
