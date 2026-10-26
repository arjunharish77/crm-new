"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { trackEvent } from "@/components/analytics";

const SIGNUP_TEXT = "Get our newsletter about online degrees, fees and admission dates. We'll email you a link to confirm. Unsubscribe any time.";

// Double opt-in newsletter sign-up (next-phase plan, decision 9). The server answers the same way
// whether or not the address is already on the list.
export function NewsletterSignup({ variant = "footer" }: { variant?: "footer" | "article" }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("busy"); setMessage("");
    try {
      const response = await fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, ...(website ? { website } : {}) }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "We couldn't sign you up. Please try again.");
      setState("sent"); setMessage("Check your inbox for a confirmation link. You're subscribed once you confirm.");
      trackEvent("newsletter_signup_requested", { placement: variant });
    } catch (error) {
      setState("error"); setMessage(error instanceof Error ? error.message : "We couldn't sign you up. Please try again.");
    }
  }
  return <section className={`newsletter-signup is-${variant}`} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>Newsletter</h2>
    <p id={`${id}-help`}>{SIGNUP_TEXT}</p>
    {state === "sent" ? <p role="status" className="newsletter-signup-status">{message}</p> : <form onSubmit={submit} className="newsletter-signup-form">
      <label htmlFor={`${id}-email`} className="sr-only">Email address</label>
      <input id={`${id}-email`} type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" aria-describedby={`${id}-help`} value={email} onChange={event => setEmail(event.target.value)} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="newsletter-signup-trap" value={website} onChange={event => setWebsite(event.target.value)} />
      <button type="submit" className="btn primary" disabled={state === "busy"}>{state === "busy" ? "Sending…" : "Subscribe"}</button>
    </form>}
    {state === "error" ? <p role="alert" className="newsletter-signup-error">{message}</p> : null}
    <p className="newsletter-signup-privacy"><Link href="/privacy#marketing">How we use your email</Link></p>
  </section>;
}
