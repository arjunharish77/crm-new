# Prompt for Claude Code

Paste this as your first message, with this whole folder attached.

---

You are working on **UnnatiVidya**, an aggregator for UGC-entitled online degrees. The live app is the Next.js project at `apps/unnatividya` inside the monorepo `arjunharish77/crm-new` (branch `main`). Everything else in that monorepo — `apps/web`, `packages/`, root-level `src/` — belongs to a separate CRM app and is **out of scope**.

I am giving you a design package that redesigns every public page of that app and adds several missing pages and features.

## Read in this order
1. `README.md` — design tokens, shared chrome, asset mapping, global interaction rules, build order, definition of done.
2. `GAP_ANALYSIS.md` — everything broken or missing in the current app, grouped as: (A) broken now, (B) missing pages and sections, (C) functional gaps, (D) content gaps.
3. `PAGE_SPECS.md` — per-screen build instructions with exact layout values.
4. `designs/*.dc.html` — the actual designs. Open them in a browser; they are interactive. Start at `designs/Index.dc.html`.

## The task
Rebuild the public site in the existing Next.js app to match these designs, and close the gaps in `GAP_ANALYSIS.md`.

Rules:
- **This is a refresh, not a rewrite.** Keep the App Router structure, the data layer (`src/data/catalog.ts`, `blog.ts`, `guide-content.ts`, `media.ts`), the lib helpers, the API routes, the migrations and the admin sub-pages. Update the components and page layouts.
- **Reuse the app's real data.** `designs/uv-data.js` is a mirror included only so the HTML files run standalone. Never import it into the app.
- **All styling values in the designs are inline. Treat them as the spec.** Port them to the app's existing styling approach (`globals.css` + the CSS variables already defined there). Do not invent new colours, radii or shadows.
- **The design tokens already exist** in `src/styles/globals.css` — `--uv-primary` etc. Use them.
- Start with the four items in `GAP_ANALYSIS.md` section A. They are live bugs: a 404ing footer link, three missing image files, letterboxed logo SVGs, and a header that overflows between 900 and 1150px.

## Highest-value changes, in order
1. Fix section A bugs (broken `/tools/emi-calculator` route, missing media assets, logo `viewBox` crops, header breakpoint 900 → 1100 with `!important`).
2. Shared chrome: header with "Guides" in the nav and the new mobile collapse; footer with real approval badges; sticky CTAs.
3. Lead wizard as one shared component, with **page context passed into every entry point** and recorded on the lead.
4. Home, Courses, Course detail — the pages that carry traffic.
5. Compare's new slot-and-picker selector (the chip list does not scale past 30 courses).
6. Universities, University detail, Recommender.
7. Blog, Article, Guides, Specializations.
8. Shortlist, the new EMI calculator route, How we verify, the four legal pages.
9. Admin dashboard.
10. Full responsive pass against `designs/Mobile.dc.html`.

## Things to stub behind an interface, not hardcode
- OTP send/verify — the app has `src/lib/otp.ts` and `/api/otp`; keep using them.
- CRM lead push — `src/lib/crm-sync.ts` exists; extend the payload with the new context field.
- Recommender chat — the design's replies are scripted. Wire to a real LLM with the catalog as context; keep the quiz scoring deterministic and server-side (formula in `GAP_ANALYSIS.md` §C3).

## Constraints
- Do not redraw or recreate the logos. Use the files in `public/`, corrected per the `viewBox` table in `README.md` §5.
- Placement figures are university-level and are "assistance, not guaranteed" — keep that wording. Salary bands are indicative and must be labelled as such.
- Keep every existing route and slug. SEO depends on them.
- Accessibility: focus rings, `aria-expanded`, `aria-label` on icon buttons, real `<label>`s, no skipped heading levels, 44px tap targets.

## Definition of done
Listed at the end of `README.md`. In short: all 18 screens match at 1280px and 390px, no horizontal overflow at any of 360/390/768/924/1100/1280/1440, every interaction works, logos render at true aspect ratio, leads reach the CRM with context, and Lighthouse SEO and accessibility are both ≥90 on content pages.

Before you start, read the four documents and tell me your build plan and anything in the designs that conflicts with the existing code.
