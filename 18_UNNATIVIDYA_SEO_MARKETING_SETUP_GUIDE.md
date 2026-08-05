# Unnati Vidya — SEO & Marketing Tools: Complete Setup Guide (Beginner-Friendly)

This is a hands-on, click-by-click guide to every account you need to create and every
setting you need to configure to get Unnati Vidya properly tracked and discoverable by
Google/Bing. It assumes you have never done this before. Every technical claim in this
document was checked directly against the actual code — not assumed — so if a step says
"paste this into a file," that's because the code genuinely reads that exact value.

This document is about **setup** (accounts + configuration). For **strategy** (what content
to write, keyword lists, launch checklist, monthly review process), see
`13_UNNATIVIDYA_SEO_MARKETING_RUNBOOK.md` — read this doc first, then that one.

---

## Part 0 — The big picture (read this first)

There are three completely different kinds of "SEO work," and it's easy to conflate them:

1. **Things already built into the website that need zero setup from you.** The site
   already has a sitemap, a robots.txt file, structured data (the stuff that makes rich
   results show up in Google), canonical URLs, and an automatic redirect manager. You don't
   need to do anything for these — they're just facts worth knowing so you don't waste time
   trying to "set them up." Covered in Part 6.
2. **External accounts you create on other companies' websites** (Google, Bing, etc.), which
   each give you back one piece of text (a "verification code," a "Measurement ID," a
   "Container ID"). Covered in Parts 1–4.
3. **One file on the server** where those pieces of text get pasted in, after which the
   website automatically starts using them — no code changes, ever. This file is called
   `.env`. Covered in Part 5 (and referenced throughout).

**The one file that matters**: `deploy/vps/.env` on the production server. This is a plain
text file with lines like `KEY=value`. You (or whoever has access to the VPS) open it with
a text editor, add or change a line, save it, and restart one thing — that's the entire
"how do I connect account X to the website" process, every single time. There is a local-dev
equivalent at `apps/unnatividya/.env` if you're testing on a developer's own laptop instead
of the live site — same idea, different file.

**A word of caution before you touch that file**: it also holds real secrets (database
passwords, session keys) for the site that are already working. Only ever *add new lines* or
*change one specific line* — never replace the whole file, and never copy a blank template
over it. (This exact mistake happened once already during this project's setup and caused a
real outage — see the note in `17_UNNATIVIDYA_VPS_LAUNCH_GUIDE.md` Part 0 if you want the
full story. The short version: be surgical, not wholesale.)

---

## Part 1 — Google Search Console (find out how Google sees your site)

**What it's for, in plain terms**: this is Google's own dashboard for your website. It tells
you which of your pages Google has actually found and indexed, what people typed into Google
before clicking through to you, whether any pages have technical errors, and lets you
manually tell Google "here's my full list of pages, please crawl them" (submitting a
sitemap). It is completely free and there's no reason not to have it.

### Step-by-step setup

1. Go to **search.google.com/search-console** and sign in with a Google account (create one
   first at accounts.google.com if you don't have one — use an account that whoever manages
   this project long-term will keep access to, not a personal throwaway).
2. Click **Add property**.
3. You'll be asked to choose between "Domain" and "URL prefix." **Choose URL prefix.**
   (This matters: a "Domain" property can only be verified via a DNS record, and the website's
   code is not set up for that method — it's built for the HTML-tag method instead, which
   only "URL prefix" properties offer.)
4. Type `https://unnatividya.com` exactly (with `https://`, no trailing slash) and click
   **Continue**.
5. Google shows you several verification methods. Click the **HTML tag** tab. You'll see a
   line that looks like:
   ```
   <meta name="google-site-verification" content="SOME_LONG_RANDOM_STRING" />
   ```
6. Copy just the value inside `content="..."` — that long random string, nothing else.
7. **Do not click "Verify" yet.** First, that string needs to actually appear on the live
   site, which means:
   - Get access to `deploy/vps/.env` on the production server (see Part 0).
   - Find the line that starts with `GOOGLE_SITE_VERIFICATION=` (it currently exists with a
     blank value, ready for this).
   - Change it to `GOOGLE_SITE_VERIFICATION=SOME_LONG_RANDOM_STRING` (using your actual
     value from step 6, no quotes needed).
   - Save the file, then have the site restarted so it picks up the change:
     ```bash
     docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d unnatividya-web
     ```
8. Confirm it worked before clicking Verify — visit `https://unnatividya.com` in a browser,
   right-click → **View Page Source**, and search (Ctrl/Cmd+F) for `google-site-verification`.
   You should see your exact string in a `<meta>` tag in the `<head>`.
9. Now go back to Search Console and click **Verify**. It should succeed immediately.

### Submit your sitemap (do this right after verifying)

10. In the left sidebar, click **Sitemaps**.
11. In the "Add a new sitemap" box, type `sitemap-index.xml` and click **Submit**.
    (The site has two working sitemap formats — a single-file one at `/sitemap.xml` and a
    split, multi-file one at `/sitemap-index.xml` that breaks pages down by type — courses,
    universities, blog posts, fee guides. Submitting the index version is preferred since it
    gives you separate coverage stats per page type in Search Console later.)
12. Status should change to "Success" within a few minutes to a few hours. If it says
    "Couldn't fetch," wait — it can take a while the very first time.

### What you'll actually use this for, week to week

- **Performance** tab: real search queries people used to find you, and your average
  position in results. This is your best source of real keyword data — better than guessing.
- **Pages** tab: which pages are indexed vs. excluded, and why (thin content, duplicate,
  crawled but not indexed, etc.).
- **URL Inspection** tool (search bar at the top): paste any URL from your site to see
  exactly how Google sees it right now, and to request it be recrawled after a big change.

---

## Part 2 — Bing Webmaster Tools (the same thing, for Bing/Microsoft)

**What it's for**: same idea as Search Console, but for Bing. Bing's search share is smaller
than Google's but real, and setup takes five minutes — there's no reason to skip it.

### Step-by-step setup

1. Go to **www.bing.com/webmasters** and sign in (a Microsoft account, or you can sign in
   with the same Google account you just used — Bing supports that).
2. There's often an **"Import from Google Search Console"** option right after signing in —
   if you see it, use it; it can auto-import your verified site and sitemap in one click, and
   you can skip to step 8 below if that works.
3. If importing isn't available or you'd rather do it manually: click **Add a site**, enter
   `https://unnatividya.com`, and continue.
4. Choose the **HTML Meta Tag** verification method (same reasoning as Google — this is what
   the code supports).
5. Copy the value inside the `content="..."` of the meta tag Bing shows you.
6. On the VPS, edit `deploy/vps/.env` and set:
   ```
   BING_SITE_VERIFICATION=YOUR_VALUE_HERE
   ```
7. Restart the site the same way as step 7 in Part 1, then confirm via View Page Source —
   search for `msvalidate.01` this time (that's Bing's internal tag name; the code
   automatically renders it correctly even though the env variable is called
   `BING_SITE_VERIFICATION`).
8. Click **Verify** in Bing Webmaster Tools.
9. Go to **Sitemaps** in the left sidebar, submit `https://unnatividya.com/sitemap-index.xml`.

---

## Part 3 — Google Analytics 4 (GA4) — visitor behavior tracking

**What it's for**: this tells you how many people visit the site, which pages they look at,
how long they stay, where they came from (search, direct, a link you shared), and — most
importantly for a lead-generation site — whether they actually submit the enquiry form. Search
Console tells you about *search*; GA4 tells you about *what happens after someone lands on
your site*. Both matter, for different questions.

### Step-by-step setup

1. Go to **analytics.google.com** and sign in.
2. If this is the very first time using Google Analytics on this account, it'll walk you
   through a setup wizard. Otherwise, click the **Admin** gear icon (bottom-left).
3. Click **Create Account**. Give it a name like "Unnati Vidya." Leave the data-sharing
   checkboxes at their defaults unless you have a specific reason to change them, then
   **Next**.
4. Now create a **Property** inside that account — name it "Unnati Vidya Website," set your
   time zone (India, GMT+5:30) and currency (INR), then **Next**.
5. Fill in basic business details (industry category: "Education," business size: whatever's
   accurate) — this doesn't affect tracking, it's just for Google's own benchmarking reports.
6. Choose your business objectives (e.g., "Generate leads") — again, cosmetic, just tailors
   which reports Google shows you by default.
7. You'll land on a "Choose a platform" screen — click **Web**.
8. Enter your website URL (`https://unnatividya.com`) and a stream name ("Unnati Vidya Web"),
   then **Create stream**.
9. You'll now see a **Measurement ID** that looks like `G-XXXXXXXXXX`. Copy the whole thing,
   including the `G-`.
10. On the VPS, edit `deploy/vps/.env`:
    ```
    NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
    ```
11. Restart the site (same command as before):
    ```bash
    docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d unnatividya-web
    ```
12. Verify it's working: in GA4, go to **Reports → Realtime**, then in a separate browser
    tab/private window visit `https://unnatividya.com`. Within about 30 seconds you should
    see "1" active user show up in the Realtime report. If you see that, tracking is live.

### What GA4 will already show you without any extra setup

Because the site already fires real events (not something you need to configure — this is
already wired into the lead form, OTP flow, course comparison, and AI recommender), GA4's
default event reports will start showing:
- `lead_form_start` / `lead_form_submit` — how many people start vs. finish the enquiry form
- `email_otp_verified` — how many verify their email
- `course_compare_add`, `recommender_complete` — engagement with the comparison and AI tools
- Standard page views, session counts, traffic sources, and bounce/engagement rate per page

You don't need to create these as "custom events" — GA4 picks up any event the site sends
automatically the moment tracking is live.

---

## Part 4 — Google Tag Manager (GTM) — optional, for later flexibility

**What it's for, and why you might skip it for now**: GTM is a *container* for tracking
scripts. Instead of asking a developer to add a new tracking snippet's code every time you
want to try a new tool, you install ONE snippet (GTM) once, and then add/remove/edit tags
through a web dashboard yourself, no code changes needed.

**Important: this is genuinely optional right now.** The code treats GA4 and GTM as two
completely separate, independent things — you can run GA4 directly (Part 3) without ever
touching GTM, and that's a perfectly complete setup. Only add GTM if you specifically expect
to add more tracking tools later (e.g., a retargeting pixel) and want to avoid needing a
developer each time.

### Step-by-step setup (if you want it)

1. Go to **tagmanager.google.com** and sign in.
2. Click **Create Account**. Name it "Unnati Vidya," country India.
3. Set up a container: name it "unnatividya.com," target platform **Web**, then **Create**.
4. Accept the terms of service.
5. You'll be shown install instructions with a **Container ID** like `GTM-XXXXXXX` — copy
   just that ID (you don't need the code snippets it shows you; the website already has the
   correct snippet built in, it just needs this ID).
6. On the VPS, edit `deploy/vps/.env`:
   ```
   NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX
   ```
7. Restart the site the same way as before.
8. In the GTM dashboard, click **Preview**, enter `https://unnatividya.com`, and confirm the
   debug panel shows GTM has loaded on the live page.

If you set up GTM, you can *optionally* also move your GA4 tracking to run through it instead
of directly (a "GA4 Configuration" tag inside GTM) — but there's no requirement to do this;
running GA4 directly via `NEXT_PUBLIC_GA_ID` alongside GTM for other tags works fine too, and
is simpler.

---

## Part 5 — IndexNow (instant Bing/other search-engine notification, zero accounts)

**What it's for**: normally search engines re-crawl your site on their own schedule, which can
take days. IndexNow is a shared protocol (backed by Bing and a few others) that lets you say
"hey, recrawl this specific URL right now" — useful the moment you publish or meaningfully
update a page. **No account, no signup, no company website to visit** — you just generate a
random key yourself and prove you own the site by hosting that key at a specific URL, which
the website already does automatically.

### Step-by-step setup

1. Generate a random key yourself — any long random string works. On the VPS:
   ```bash
   openssl rand -hex 16
   ```
2. Edit `deploy/vps/.env`:
   ```
   INDEXNOW_ENABLED=true
   INDEXNOW_KEY=the-random-string-from-step-1
   ```
3. Restart the site.
4. Confirm the key is being served correctly (this is the "proof of ownership" IndexNow
   checks for):
   ```bash
   curl https://unnatividya.com/indexnow-key
   ```
   This should print back the exact same random string. If it 404s, `INDEXNOW_ENABLED` isn't
   set to exactly `true`, or the key is empty — double check the `.env` lines.

### How to actually use it day to day

There's currently **no button in the admin dashboard for this** — submitting URLs to
IndexNow right now requires someone technical to run one command (this is a real gap worth
asking a developer to close with a simple "Submit to IndexNow" button in `/admin` later, if
you end up using this often). For now, after publishing something new, a developer runs:

```bash
curl -X POST https://unnatividya.com/api/admin/seo/indexnow \
  -H "Content-Type: application/json" \
  --cookie "uv_admin_session=<a-logged-in-admin-session-cookie>" \
  -d '{"urls": ["https://unnatividya.com/blog/your-new-post"]}'
```

(This requires being logged into `/admin` first, since the endpoint is admin-only — the
session cookie has to come from an actual logged-in browser session.) If you leave out the
`urls` field entirely, it defaults to submitting your current courses, universities, and
static pages — but notably **not** blog posts or fee guides, so for those, always pass the
specific URL explicitly.

---

## Part 6 — Already built in — nothing to set up, just know it's there

These are real, working, and required zero manual account setup — listed here so you know
what NOT to spend time "configuring":

- **`robots.txt`** at `/robots.txt` — tells search engines what they're allowed to crawl.
  Already correctly blocks `/admin`, `/api`, and `/lead` (private/functional pages that
  shouldn't show up in search results) and allows everything else.
- **Sitemaps** at `/sitemap.xml` (one combined file) and `/sitemap-index.xml` (split by page
  type) — both are real, live, and update automatically as courses/universities/blog
  posts/fee guides are added. You only interact with these once, to submit them (Parts 1–2).
- **Structured data** (the technical term is "Schema.org JSON-LD") — this is what makes
  Google show star ratings, FAQ dropdowns, and breadcrumb trails directly in search results
  instead of a plain blue link. Already live on every course page, university page, blog
  post, and fee guide — nothing to configure, it's generated automatically from the same real
  data shown on the page.
- **Canonical URLs** — every page declares its own "real" URL to search engines, which
  prevents Google from treating slightly-different URLs to the same content as duplicates.
  Already set correctly on every page.
- **A working redirect manager** — if a URL ever needs to permanently point somewhere else
  (e.g., a course gets renamed), there's already an admin tool for this at `/admin/redirects`
  — no code deploy needed for a redirect, an admin can add one directly.

**One small technical thing worth knowing about (not urgent, just FYI)**: the site currently
serves identical content at both `https://unnatividya.com` and `https://www.unnatividya.com`
without redirecting one to the other. Every page's canonical tag still correctly points
search engines to the non-`www` version, so this isn't actively hurting you today — but the
cleaner long-term fix is a proper redirect from one to the other at the server level. Worth
asking a developer to add when there's a free moment; not worth blocking anything else on.

---

## Part 7 — Free tools with no setup at all (bookmark these)

These require a Google login (which you already have) but no "property," no verification,
and no website configuration — you just use them directly whenever you need them:

- **Google Trends** (trends.google.com) — see whether a keyword/phrase is actually searched
  for, and how its popularity is trending, before spending time writing content about it.
- **Google/Bing autocomplete + "People Also Ask"** — literally just start typing a search
  query on Google and read the suggestions, or search something and scroll to the "People
  also ask" box. Free, instant, and the single best source of real question-phrasing people
  use.
- **Rich Results Test** (search.google.com/test/rich-results) — paste any URL from the site
  and see exactly which structured-data rich results Google is eligible to show for it. Use
  this after any page-template change to confirm the JSON-LD is still valid.
- **PageSpeed Insights** (pagespeed.web.dev) — paste a URL, get a real performance score plus
  specific fixes. Run this after the real photos/certificates finish being added to the site
  (per `14_UNNATIVIDYA_ASSET_CHECKLIST.md`) — image weight is the most common cause of a poor
  score, and that work directly affects this number.
- **Schema Markup Validator** (validator.schema.org) — a second, independent structured-data
  checker (Google's own tool sometimes reports things slightly differently) — good for a
  cross-check when something looks off in the Rich Results Test.

---

## Part 8 — Not built (mentioned so you don't assume they exist)

If you've read marketing checklists elsewhere and are wondering why they're not covered here
— these were specifically checked against the actual code, and **none of them exist yet**:

- **Microsoft Clarity** / **Hotjar** (session recordings, heatmaps) — not integrated. Would
  need a small code change (one script tag, same pattern as GA4/GTM) before it could be
  configured via `.env`. Ask a developer to add this if you want it — it's a small addition.
- **Meta (Facebook) Pixel** / **LinkedIn Insight Tag** — not integrated, same situation.
- **Google Business Profile** — Unnati Vidya doesn't have a registered physical business
  address anywhere in its data (it's an online-only aggregator), so there isn't a natural
  "location" to create a Business Profile for. If you do want one (some purely-online
  businesses still create one, using a service address), that's a business decision to make
  first — the website has no code dependency on this either way.

---

## Checklist summary

| # | Tool | Account needed? | Where the value goes | Status |
|---|---|---|---|---|
| 1 | Google Search Console | Yes (free) | `GOOGLE_SITE_VERIFICATION` in `.env` | ☐ |
| 2 | Bing Webmaster Tools | Yes (free) | `BING_SITE_VERIFICATION` in `.env` | ☐ |
| 3 | Google Analytics 4 | Yes (free) | `NEXT_PUBLIC_GA_ID` in `.env` | ☐ |
| 4 | Google Tag Manager | Optional | `NEXT_PUBLIC_GTM_ID` in `.env` | ☐ |
| 5 | IndexNow | No — self-issued | `INDEXNOW_ENABLED` + `INDEXNOW_KEY` in `.env` | ☐ |
| 6 | Sitemaps/robots/structured data/redirects | Already done | N/A | ✔ |
| 7 | Google Trends / autocomplete / Rich Results Test / PageSpeed | No account, just bookmark | N/A | N/A |

After completing 1–5, restart the site once more to be sure everything's picked up, then
re-read `13_UNNATIVIDYA_SEO_MARKETING_RUNBOOK.md` for what to actually *do* with all this data
once it starts flowing in.
