import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, CircleCheck, MailCheck } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirm your subscription", robots: { index: false, follow: false } };

const MESSAGES: Record<string, { title: string; body: string; tone: "success" | "warning" }> = {
  confirmed: { title: "You're subscribed", body: "Thanks for confirming. You'll get Unnati Vidya's newsletter about online degrees, fees and admission dates. Every email has an unsubscribe link.", tone: "success" },
  invalid: { title: "This link has expired or was already used", body: "Confirmation links work once, for 7 days. If you still want the newsletter, sign up again from the footer of any page.", tone: "warning" },
  "try-later": { title: "Please try again in a few minutes", body: "We received too many requests from your connection.", tone: "warning" },
};

// The emailed link lands here; confirming needs the button (a POST), so link scanners that open
// emails can't subscribe anyone.
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : "";
  const token = typeof params.token === "string" ? params.token.slice(0, 100) : "";
  const message = MESSAGES[status];
  const tone = message ? message.tone : token ? "primary" : "warning";
  const Icon = tone === "success" ? CircleCheck : tone === "primary" ? MailCheck : CircleAlert;
  return <section className="uv-status-page newsletter-page" aria-labelledby="newsletter-title">
    <div className="uv-status-card">
      <span className={`uv-status-icon is-${tone}`} aria-hidden="true"><Icon size={32} /></span>
      {message ? <>
        <h1 id="newsletter-title">{message.title}</h1>
        <p>{message.body}</p>
      </> : token ? <>
        <h1 id="newsletter-title">Confirm your newsletter subscription</h1>
        <p>Select the button to start receiving Unnati Vidya&apos;s newsletter about online degrees, fees and admission dates. You can unsubscribe at any time.</p>
        <form method="post" action="/api/newsletter/confirm"><input type="hidden" name="token" value={token} /><button type="submit" className="btn primary large">Confirm subscription</button></form>
      </> : <>
        <h1 id="newsletter-title">Confirmation link missing</h1>
        <p>Open the link from your confirmation email again.</p>
      </>}
      <nav aria-label="Explore from here" className="uv-status-links"><Link href="/courses">Browse courses</Link><Link href="/blog">Read the blog</Link><Link href="/">Go to homepage</Link></nav>
    </div>
  </section>;
}
