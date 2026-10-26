# Unnati Vidya website UI redesign: plan, exact changes and conflicts

Prepared 10 October 2026 from the Claude Design handoff in `apps/unnatividya/design_handoff_unnati_vidya/` (README and 22 `.dc.html` prototypes, Home with the navy hero and no logo marquee).

**Status: approved 10 October 2026 (plus "pages not in the designs get the new format" and "Admin too"); implemented locally 11 October 2026, see [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md), increment 88.** Not deployed. Learner-tools wave 4 stays paused. Where a §10 answer differs from a recommendation in §4–§8 (Q7 keeps the recommender preview image, Q9 adds match percentages from the learner's own answers, Q16 sets the mobile bars), §10 wins.

Scope is **UI only**: look, layout, components and interaction. Data, routes, lead capture, verification gates, CMS and published facts stay as they are, except where §8 asks for a decision.

## Detailed specifications (appendices)

Each appendix gives, per page or component:
- the exact design spec (every colour, size, weight, radius, spacing, shadow, quoted copy, icon, state and breakpoint, with prototype line references);
- what exists today in the code;
- the concrete changes required, mapped to our files;
- every conflict found.

| Appendix | Covers |
|---|---|
| [0 · Constraints checklist](ui-redesign-2026-10/0-constraints-checklist.md) | The owner decisions and current behaviour every finding was checked against |
| [A · Shared components and Home](ui-redesign-2026-10/A-shared-components-and-home.md) | Tokens, fonts and icons, header, footer, program card, FAQ accordion, the full Home page |
| [B · Courses, Course, Compare](ui-redesign-2026-10/B-courses-course-compare.md) | `/courses`, `/courses/[slug]`, `/compare` (gated tool) and `/compare/[course]/[pair]` |
| [C · Universities, Specializations, Guides, Article](ui-redesign-2026-10/C-universities-specializations-guides.md) | `/universities`, `/universities/[slug]`, `/specializations`, `/specializations/[slug]`, `/online-degree-guides`, `/blog`, and both article types |
| [D · Tools, Apply and company pages](ui-redesign-2026-10/D-tools-apply-company-pages.md) | Recommender, EMI calculator, total cost planner, eligibility checker, shortlist, Apply now (page and modal), About, How we verify, Privacy/Terms/Refund, newsletter pages |
| [E · Current codebase inventory](ui-redesign-2026-10/E-current-codebase-inventory.md) | Routes, styling system, tokens, components, client state, CSP and fonts, assets, tests affected, performance baseline, things to preserve |

This document is the summary, the decision list and the delivery plan. The appendices are the build specification.

---

## 1. How the redesign will be built

The handoff is a set of **HTML prototypes** with a prototype runtime (`support.js`) and sample data (`uv-data.js`). Per the README, they are a visual and behavioural reference, not code to ship. The build therefore:

1. **Re-skins the existing Next.js pages** in place. Every route, its server data (`getPublishedCatalog()`, CMS articles), JSON-LD, metadata (`withSocial`/`fitTitle`), analytics attributes (`data-track-event`) and the `data-open-lead` modal hook stay.
2. **Never uses `uv-data.js` values.** Fees, EMI, counts, approvals and so on come from the published catalog. Eight design course ids differ from ours (e.g. `mscds-amity` → `msc-data-science-amity`), and the design's hard-coded figures have already drifted from the catalog (specialisation counts, review counts, university copy).
3. **Keeps our URLs.** The design's `?id=`, `?slug=`, `?key=`, `Legal?tab=`, `?ids=`, `?lvl=` and `?degree=` links map to our SEO routes and parameters (`/courses/[slug]`, `/universities/[slug]`, `/specializations/[slug]`, `/blog/[slug]`, `/online-degree-guides/[slug]`, `/privacy`, `/terms`, `/refund-policy`, `/compare?add=`, `/courses?level=&stream=&university=&q=&maxFee=&sort=`). A `degree` filter is added to `/courses` because the design's chips need it.
4. **Recreates the look pixel-accurately** where it doesn't conflict (the colours, type scale, radii, shadows, spacing and copy in the appendices). Prototype shortcuts are replaced with accessible equivalents: real buttons instead of clickable `div`s, `<details>` accordions, `<table>`, labelled controls, 44px touch targets and visible focus rings.
5. **Moves styles into tokens.** Today there are 579 inline `style={{…}}` blocks and about 1,030 hard-coded hex colours. The redesign introduces CSS custom properties for the design tokens and shared components, removing inline styles from the pages it touches, as the design standard asks.

---

## 2. Global foundation (applies to every page)

| Area | Today | Redesign | Notes |
|---|---|---|---|
| Primary colour | `#544CC8` (hover `#453DB8`) | `#5B4CF0` (hover `#4A3BDB`) plus tints `#F4F2FF`, `#F1EEFF`, `#ECE9FE`, `#D6D0FA`, `#CFC9FA` | A rebrand; needs Q1 |
| Text colours | `#363634`, `#555`, `#707070` | navy `#16133F`, ink `#2B2950`/`#4A4867`/`#6F6D8C`/`#8E8CA8` | `#8E8CA8` fails contrast for 12px text (3.25:1). Use `#6F6D8C` there. |
| Dark surfaces | `#263238` | navy `#16133F` (hero, panels, tray), footer `#1A1646` | |
| Borders | `#CFDAE6`, `#EAEAEA` | `#E8E6F3` cards, `#E4E1F3` inputs, `#F0EEF8` dividers | Input borders need a 3:1 focus/boundary treatment |
| Status | `#2E7D32` | success `#12925A`/`#12784B` on `#E7F6EE`; warning `#A35A0B` on `#FFF4E5`; error `#B42318`; star `#F0A30A` | Consolidates the design's slight colour drift |
| Font | Declares DM Sans, but **no font is loaded** (visitors see the system font) | **Plus Jakarta Sans** 400–800, self-hosted via `next/font` | The Google Fonts CDN link in the design is blocked by our CSP; self-hosting is allowed |
| Icons | lucide-react (6 icons) | Design uses the Material Symbols Rounded font | Mapped to lucide-react equivalents (table in Appendix A §0.5). No icon font: it is large, and its ligature text is read aloud by screen readers. Needs Q1 confirmation. |
| Container | 1200px, 24px gutters | 1240px, `clamp(16px,3vw,32px)` gutters; reading pages 880–980px | |
| Radius | 8 cards, 4 controls | 6 tags · 10 buttons/inputs · 14 tiles · 16 cards · 18 large cards · 20–24 panels · 99 pills | |
| Shadows | light | the README shadow set (card hover, search, hero image, sidebar, tray) | |
| Type scale | H1 43px, body 15px | Home H1 `clamp(40px,5.2vw,64px)`/800; inner H1 `clamp(30px,4.2vw,46px)`; H2 `clamp(26px,3.2vw,32px)`; body 16px | Body raised to 16px per the design standard |
| Breakpoints | 640/900/1100px | header 1080px; Courses/Course/Compare/Recommender layout 860px; auto-fit grids elsewhere | Implemented in CSS, not JS width detection (avoids a mobile flash) |
| Motion | Partial reduced-motion handling | Card hover border+shadow 0.2s; design scroll-reveal (Q10) | One global `prefers-reduced-motion` rule covers every effect |
| Stacking | Header z 100, floating CTA z 150 | Header z 40, compare tray, mobile bars | One documented z-index scale |
| Links and buttons | Mixed | Links `#5B4CF0`, hover underline; primary and outline button styles per README | On navy, link hover keeps a light colour (the design's `#4A3BDB` on navy is unreadable) |

---

## 3. Shared components

| Component | Change summary (exact spec in Appendix A) |
|---|---|
| **Header** | 68px sticky, translucent white with blur, 32px logo, nav pills (hover/active `#F4F2FF`), search icon, saved-courses link with count, primary **Apply now**. Mobile below 1080px: saved icon with badge, 44px menu button, full-width panel with icons and a full-width Apply now. Keeps all current accessibility behaviour (Escape, focus return, `aria-current`, labelled navs). Structure and labels need Q3 and Q4. **No phone link.** |
| **Footer** | Navy `#1A1646`, 32px white logo, brand line, four columns (Explore, Popular degrees, Resources, Company), bottom bar. Must also keep the **newsletter sign-up**, the **total cost planner** and **eligibility checker** links, the `/blog` Articles link, `admin@unnatividya.com` in place of the phone, and `/privacy`, `/terms`, `/refund-policy`. Regulator logos: Q12. |
| **Program card** (new, shared) | One `CourseCard` replaces the five different card layouts in use today (home, listing, similar programs, university page, shortlist). It follows the design's layout: stream icon tile, title link, university logo and name, save toggle, level badge, **per-program recognition label** (not a blanket "UGC-entitled"), rating, a three-figure strip (Duration · Total tuition · EMI from), specialisation count, then **View details** + **Compare**. Apply now on cards: Q5. Compare toggle and tray: Q6. |
| **FAQ accordion** (new, shared) | The design's two-column bordered cards with help and plus/minus icons. Built on native `<details name>`, so it works without JavaScript and the FAQ structured data still matches. "View all FAQs" is dropped because no FAQ page exists. |
| **Compare tray** (new) | Fixed bottom-centre navy bar with removable chips and "Compare N →". It opens the gated `/compare?add=` tool. Only if Q6 is approved. |
| **Inner page hero** (new) | Light lavender gradient with a radial glow, breadcrumb, H1 and subtitle, used by every inner page. |
| **Section tabs, stat strip, empty state, skeleton** (new) | As specified. Sticky tabs sit at `top: 68px` with a −130px scroll offset. The empty state uses the "two tilted cards" illustration. The skeleton is used only where data loads in the browser. |

---

## 4. Page-by-page summary

The "Exact spec" column points to the appendix section. "Must keep" lists current features the design omits, which will be fitted into the new look.

| Page (route) | Design file | Main visual changes | Must keep (absent from the design) | Exact spec |
|---|---|---|---|---|
| Home `/` | Home | Navy hero with a level and stream search card, popular chips, the hero image with two data-driven floating cards, and the approvals strip inside the hero. Then a 6-card grid; four full-bleed stream tiles; a navy course-matching panel; university cards with an overlapping logo tile; a lavender compare teaser with a mini table; How it works plus a hairline perks grid; testimonials; the two-column FAQ with Apply now. | "10k+ learners guided"; the "No hidden charges / Approvals you can check / Support till enrolment" trust points; free-text search (Q15); computed figures; the mobile Apply bar (Q16) | A §5 |
| Courses `/courses` | Courses | Inner hero with a 52px search, a "Find my course" button and quick-compare chips; a filter sidebar (checkbox groups with live counts, maximum-tuition slider, Clear all); results as a card grid with count, sort and active-filter chips; illustrated empty state; mobile "Filters (n)" panel; compare tray | Relevance and fee sorts only (no "Highest rated"); URL-synced filters; "tuition shown" note | B §1 |
| Course `/courses/[slug]` | Course | Two-column hero (logo, H1, meta row, about, Apply now / Compare / Save, campus image), 5-cell stat strip, sticky section tabs, card-style sections, sticky right sidebar with the fee, mobile bottom bar with fee and Apply now | Category fee selector (Indian/NRI/foreign); Recognition section and hero chip; source and checked-date lines; Next intake; "Four checks before you apply"; study and assessment blocks; eligibility checker and total-cost links; "Confirm with the university" values; indicative salary label; university-wide placement label | B §2 |
| Compare `/compare` | Compare | Hero with Share and quick-start chips, three slot cards (Change, ×, empty picker), a sticky-header table with logo columns, mobile per-feature cards, "Explore more" and published-comparison link grid | **The OTP gate** (the design shows results to everyone); no Best/Lowest tags; "Fee outside India" row; differences-only toggle; university-wide labels | B §3 |
| Editorial compare `/compare/[course]/[pair]` | none | Restyled with the Compare table and tokens | Public, crawlable, with its FAQs | B §3.3 |
| Universities `/universities` | Universities | Three wide cards (campus image, logo, approvals, stat block, buttons), an "at a glance" table, FAQ | No best-value highlighting; ratings and placement not enlarged into badges; university-wide labels | C §1 |
| University `/universities/[slug]` | University | Course-style hero, stat strip, sticky tabs, program list rows, approvals and scholarships, placements and admission, "Other universities" | NIRF card with source and institution caveat; per-badge recognition notes; "Before choosing" checklist; sources; Apply rail and mobile bar; UG/PG grouping; save buttons | C §2 |
| Specializations `/specializations` | Specializations | Search plus degree pills, grouped spec cards with university logos and "from ₹X", illustrated empty state, navy Find-my-course strip | All 101 existing slugs (the design's slug rule differs) | C §3 |
| Specialization `/specializations/[slug]` | Specialization | Hero with a 4-stat strip, program cards, "Compare these programs", other-specialization chips, FAQ | Sibling specializations per university; career caveat; related guides. The design's "Who it suits" checklist is not built, because it would be invented content. | C §4 |
| Guides `/online-degree-guides` and Articles `/blog` | Guides | Category pills, featured gradient card, guide grid, tool shortcuts, FAQ | All 68 programmatic guides and the 26 CMS articles with their search and filters; hub structure needs Q11 | C §5 |
| Article `/blog/[slug]` and guide `/online-degree-guides/[slug]` | Article | 880px column, category tag, H1, deck, byline line, "In this guide" contents box, 16px/1.75 body, data tables, compare CTA, related guides | Byline **Content Team, Unnati Vidya**; real dates (no hard-coded "Updated October 2026"); sources with checked dates; newsletter sign-up; FAQ; cover image; Apply now; recognition and outside-India data on guides | C §6 |
| Find my course `/recommender` | Recommender | Progress bars, "STEP N OF 5", large option cards with icons, auto-advance, Back link; results with a "Your journey" sidebar, result cards, help panel, more programs | The current **five-question Groq tool**: hard filters, AI ordering, follow-up chat, source links, retry and fallback. No match percentages from rating or placement (Q9). | D §1 |
| EMI calculator `/tools/emi-calculator` | EMICalculator | Left inputs card (program select, sliders, tenure pills), right navy result card with a large EMI, stacked bar and breakdown, "Same plan, other universities" table | Applicant-category selector and INR-only guard; manual fee; current ranges (Q9); "Check loan eligibility" becomes Apply now | D §2 |
| Total cost planner, eligibility checker | none | Restyled with the design's tokens, cards and form controls | All behaviour (increments 82–87) | D §3 |
| Shortlist `/shortlist` | Shortlist | Hero with "Compare N" and "Clear all", card grid, second-opinion CTA, illustrated empty state with suggestions | Select-for-compare (max 3), undo | D §4 |
| Apply now `/lead` and modal | Apply | Two-column page (eyebrow, H1, perks on the left; form card on the right), field and validation styling, success panel with "What happens next" | The **contact-first three-step flow**: international phone codes, one **unticked** required consent (v2), course and university on step 2, email OTP on step 3. Truthful success copy (no "we'll call you soon"). No phone. | D §5 |
| About `/about` | About | Large H1, three value cards, how-it-works steps beside a stat grid, navy panel with Apply now | Contact us (Noida address, admin@unnatividya.com); "How an enquiry works"; "Before making a decision" caveats | D §6 |
| How we verify `/how-we-verify` | HowWeVerify | Four-step process tiles, "What the labels mean" table, source links, report-an-error CTA (`mailto:admin@unnatividya.com`) | Honest "verification is ongoing" wording; labels use "Confirm with the university" (Q13) | D §7 |
| Privacy, Terms, Refund | Legal | Underline tab bar linking the three pages, sticky section nav on desktop, content sections | **Separate URLs** and the reviewed policy text (the design's legal copy is placeholder); the `#marketing` section | D §8 |
| Newsletter confirm and unsubscribe, 404 | none | Restyled with the tokens | Behaviour unchanged | D §9 |

---

## 5. Conflicts already settled by earlier owner decisions

Where the handoff contradicts a decision you have already made, the plan **keeps your decision** and copies only the design's look. These are not new questions; Q2 confirms the rule as a whole.

| # | The design shows | Plan | Earlier decision |
|---|---|---|---|
| 1 | "Call 1800-120-4050" in the header menu, footer, Home FAQ, course sidebar, Apply page, About, Legal and FAQ answers; "request a callback … within one working day" | Removed everywhere. Contact is Apply now and admin@unnatividya.com. | §11 #16 |
| 2 | Single-step Apply form, +91-only 10-digit phone, consent **ticked by default**, no OTP, "We'll call you soon" | Keep the contact-first 3-step flow with international codes, one **unticked** consent (v2) and OTP; use the design's styling only | Design standard §5, increment 80 |
| 3 | Compare results open to everyone; a default compare list of three MBAs | The interactive compare stays behind form plus email OTP; the selection starts empty | Owner rule on gated compare |
| 4 | Green "Best"/"Lowest" tags and "The best value in each row is highlighted" (Home teaser, Compare, Universities table) | No winner highlighting; placement, package and partners labelled "university-wide" | T3 |
| 5 | "Full payment · Save 2%" plan; template credits, "Online proctored", ₹500 for every course | Not shown. "Confirm with the university" stays, and ₹500 only for MUJ/SMU Indian applicants. | T2 |
| 6 | Sneha Iyer and Rohit Verma reviews and a Reviews tab on the course page; "sample" testimonials | Course reviews stay removed. Home keeps exactly the three existing testimonials, unchanged. | T2, decision 5 |
| 7 | "UGC-entitled" on every card, in the hero eyebrow, overview, FAQ answers, specialization FAQ and article tables; university approval badges on the course image | Per-program 2026-27 recognition result from the CMS; institution badges kept separate from program status | Wave 2 recognition, design standard §6 |
| 8 | "Unbiased by design / universities pay us the same" and "universities compensate us equally … no commission bias" | Replaced with **"No hidden charges"** wording. This also fixes the current site, which still has it in the How-it-works subtitle and FAQ #2. | §11 #3, #14 |
| 9 | "Approvals verified … re-checked every admission cycle"; "every fee and approval checked each cycle" | "Approvals you can check" wording and the honest "verification is ongoing" text | §11 #11 |
| 10 | "Highest rated" sort; recommender scoring on placement and rating; match percentages | Relevance and fee sorts only; ratings and deferred figures never rank anything | T4, design standard §15 |
| 11 | Salary bands without a label | "Indicative industry ranges, not verified" | Decision 5 |
| 12 | Byline "Unnati Vidya research team", "Source-verified" badges, hard-coded "Updated October 2026" and read times | **Content Team, Unnati Vidya**; real dates; computed reading time; sources with checked dates | Owner byline rule, wave 3 |
| 13 | "Start application enquiry", "Request a callback", "Check loan eligibility" buttons | **Apply now** | CTA rule |
| 14 | Query-parameter URLs; a single Legal page with `?tab=` | Existing SEO URLs and three separate legal pages | SEO decisions |
| 15 | Placeholder university descriptions and review counts, MUJ copy reused for SMU and Amity, "Who it suits" checklists, "Industry-aligned", "fully online with proctored exams", "Entrance test: Not required" for every university | Not used. Only published catalog and CMS content is shown. | Never invent facts |
| 16 | Google Fonts and Material Symbols loaded from Google's CDN | Self-hosted Plus Jakarta Sans; lucide icons | CSP and security |

---

## 6. New features the design introduces (no backend today)

| Feature | Plan |
|---|---|
| Compare toggle on every card, a saved compare list and a bottom compare tray | Build it if Q6 is approved: a new `uv_compare` list in the browser, empty at first, max 3 with an announced message, feeding the gated `/compare?add=` |
| "Download PDF" and "Email me this report" on Compare | Not built. "Print" and "Share link" instead (Q14). The email form would collect addresses without consent and get around the gate. |
| "Send report" email capture, "Check loan eligibility" | Not built; replaced by Apply now |
| Hero search by level and stream | Built as a plain `<form>` to `/courses?level=&stream=`, so it works without JavaScript. Free-text search is Q15. |
| `degree` filter on Courses | Added: the design's popular chips need it. It also fixes today's "Online B.Com" chip, which likely returns no results. |
| Scroll entrance animation | Q10 |
| Header search icon | Links to `/courses` and focuses its search box |

---

## 7. Accessibility and quality fixes applied over the design

The prototypes skip these, so the build adds them while keeping the look:
- Real `<button>`s with pressed/expanded states instead of clickable `div`s, for the menu, save, compare, tabs, pills, quiz options and FAQ.
- Every touch target at least 44px.
- Visible focus rings, including on the selects the design gives `outline:none`.
- Two contrast fixes: review counts `#8E8CA8` → `#6F6D8C`, and the hero card subtext `#DCD8FF` → white.
- Real `<table>` markup for comparison and fee tables.
- Icons marked `aria-hidden`.
- Reduced motion respected for every effect.
- No content hidden until JavaScript runs.
- Layouts checked at 320/360/390/768/1024/1280/1440px and 200% zoom.

Performance also gets three fixes: the home hero image becomes priority-loaded; the 2.6 MB Amity campus image is served resized; the `no-store` header on `/universities/*` static images is lifted. Sending the whole catalog to every page (about 136–190 KB) is noted for a later performance pass, not this redesign.

---

## 8. Decisions needed (asked one at a time; answers in §10)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Adopt the design's visual identity site-wide (primary `#5B4CF0`, navy, Plus Jakarta Sans, larger radii, 1240px container, lucide icons in place of Material Symbols)? This replaces the current purple, which the design standard said to preserve. | Adopt |
| Q2 | Where the design contradicts earlier decisions (§5), keep the earlier decisions and copy only the look? | Yes |
| Q3 | Navigation: the design's six flat links have no route to the blog, How we verify, the recommender, the total-cost planner or the eligibility checker. | Design's flat style, with "Guides" and "Tools" as small dropdowns |
| Q4 | Names: "Explore Degrees" or "Courses"; "Find my fit" or "Find my course"; "Shortlist" with a bookmark icon, or "Saved courses" with a heart | Courses · Find my course · Saved courses with the bookmark icon |
| Q5 | Program cards: the design drops the per-card **Apply now**, which every current card has | Keep View details + Compare on cards; Apply now stays on the detail page, header and mobile bar |
| Q6 | Add the design's compare toggle, saved compare list and bottom tray (empty at first, max 3, opens the gated compare)? | Yes |
| Q7 | Home course-matching panel: the design shows made-up "92% / 86% / 78%" match rows | Three real example programs without percentages, labelled as examples |
| Q8 | Home perks "Jobs (job + internship portal)", "Community (exclusive learner groups)", "30+ comparison factors" and "Support till graduation" (you confirmed only documents, loans and follow-ups until enrolment) | Replace with your confirmed points: No hidden charges, Approvals you can check, Support till enrolment, Loans help, ₹0 extra lowest-fee guarantee, 10k+ learners guided |
| Q9 | Recommender and tools: keep the current behaviour (5-question Groq tool, EMI ranges, cost planner, eligibility checker) and apply the design's look? | Yes |
| Q10 | Scroll entrance animation (sections fade up as you scroll) | None, or a CSS-only version that never hides content |
| Q11 | Guides: one "Guides" hub mixing degree guides and articles (design), or keep the two hubs with the new look | Keep two hubs, one "Guides" menu |
| Q12 | Regulator logos (UGC, NAAC, AICTE, WES, AIU) in the hero strip and footer, beside "UGC-entitled online degrees" copy | Keep the logos with "How we verify" beside them; reword the footer line to "online degrees from UGC-entitled universities" |
| Q13 | Status label wording: the design's "CONFIRM WITH COUNSELLOR" vs the site's "Confirm with the university" | Confirm with the university |
| Q14 | Compare page "Download PDF" and "Email me this report" | Replace with Print and Share link |
| Q15 | Home hero search: the design has level + stream only; today there's a free-text box | Level + stream plus a text field |
| Q16 | Mobile sticky Apply now bar on Home (the design only has one on the course page) | Keep it on Home and the course page only |

Smaller choices are settled in the appendices with stated defaults, unless you want to review them:
- the university page's primary button: Apply now;
- the "Compare {university} programs" button: goes to `/courses?university=`;
- FAQs start closed;
- "Retake quiz" clears answers;
- the Apply form shows first on phones;
- the shortlist badge is hidden when zero;
- "Total tuition" labels add "Indian applicants" where category fees exist.

---

## 9. Delivery plan (after approval)

| Phase | Work | Approx. effort |
|---|---|---|
| 1 · Foundation | Tokens as CSS variables, Plus Jakarta Sans via `next/font`, lucide icon map, base type, links, buttons, inputs and focus, container and spacing, global reduced motion, z-index scale | 1 day |
| 2 · Shared components | Header, footer (with newsletter), CourseCard with save and compare islands, compare list and tray, FAQ accordion, inner hero, section tabs, stat strip, empty state | 1.5 days |
| 3 · Home | Every section in §4, with data-driven figures | 1 day |
| 4 · Courses and Course | Listing with filters and slider, detail with tabs, sidebar and mobile bar, all must-keep blocks | 1.5 days |
| 5 · Compare | Gated tool (including a designed locked state), editorial pairs | 1 day |
| 6 · Universities, Specializations, Guides, Articles | Lists, details, hubs, both article types | 1.5 days |
| 7 · Tools and forms | Recommender, EMI, total cost, eligibility, shortlist, Apply page and modal | 1.5 days |
| 8 · Company and policy pages | About, How we verify, three policy pages, newsletter pages, 404 | 0.5 day |
| 9 · QA | Update about 25 smoke suites that check old classes and copy; screenshots at 7 widths; keyboard, zoom and reduced motion; production build and the CI rehearsal | 1.5 days |

Roughly **11 working days**, built in this order, with screenshots shared after phases 3, 4 and 7 for your review. Nothing is committed or pushed (you commit once at the end). Admin pages keep their current look; they share `globals.css`, so admin layouts get checked in QA too.

**Risks:**
- Large CSS churn could unintentionally restyle admin pages. Mitigation: public tokens scoped under the public layout; admin suites run in QA.
- The Plus Jakarta Sans download at build time needs network access in Docker. Fallback: commit the font files and use `next/font/local`.
- Test maintenance (about 25 suites).
- Visual drift from the prototypes where accessibility fixes change sizes (for example 44px targets).

---

## 10. Decision log

Filled in as the owner answers §8.

| # | Decision | Date |
|---|---|---|
| Q1 | **Adopt the design's visual identity fully:** primary `#5B4CF0`, navy surfaces, Plus Jakarta Sans (self-hosted), the design's radii, shadows, spacing and 1240px container, and lucide icons matched to the Material Symbols shapes. Admin pages keep their look. | 10 Oct 2026 |
| Q2 | **Earlier decisions win.** In all 16 conflicts listed in §5, existing owner decisions and behaviour stay and are restyled in the new design. This includes fixing the leftover "universities pay us the same" wording on the current homepage. | 10 Oct 2026 |
| Q3 | **Design's flat nav with two dropdowns.** Plain links: Courses (label per Q4), Universities, Compare, Specializations. "Guides" opens Degree guides, Articles and How we verify; "Tools" opens Find my course, EMI calculator, Total cost planner and Eligibility checker. Mobile menu lists the same items with icons. | 10 Oct 2026 |
| Q4 | **Current names, design's bookmark icon:** "Courses", "Find my course", "Saved courses (n)". The heart becomes the bookmark (`Bookmark`/`BookmarkCheck`) everywhere, with copy updated to match. The `uv_shortlist` storage key is unchanged, so saved courses survive. | 10 Oct 2026 |
| Q5 | **Cards follow the design: View details + Compare, no Apply now.** Apply now stays in the header, mobile menu, course hero, sidebar and mobile bar, the Home FAQ block, tool results and the other places it appears today, apart from the cards. | 10 Oct 2026 |
| Q6 | **Add the compare toggle, saved compare list and bottom tray, starting empty.** Browser list `uv_compare` (max 3, synced across tabs). A 4th course is refused with an announced message to remove one first. The tray's "Compare N →" opens `/compare?add=…`, which still requires the form and email OTP. Nothing is pre-selected. | 10 Oct 2026 |
| Q7 | **Course-matching panel keeps the current recommender preview image** (`/hero/recommender-preview.webp`) on the right, framed to the design's navy panel (radius and translucent border), with the existing disclaimer below. No sample match rows or percentages. | 10 Oct 2026 |
| Q8 | **Perks grid uses confirmed points only:** No hidden charges · Approvals you can check · Support till enrolment · Education-loan help · ₹0 extra lowest-fee guarantee · 10k+ learners guided. Jobs, Community, "30+ comparison factors" and "till graduation" are removed from the site. The three trust points and "10k+" now live in this grid, so the separate trust band isn't needed. | 10 Oct 2026 |
| Q9 | **Tools keep their behaviour and get the design's look, with match percentages on Find my course.** The 5-question Groq tool stays: hard filters, AI ordering, follow-up chat, sources, retry and fallback. It shows 5 progress bars, the design's option cards and the result cards with the conic match ring. **Q9a:** the percentage is a fixed, explainable score from the learner's answers and published facts only: subject match, budget headroom, level and qualification fit, and stated priority such as lowest fee. It is shown with a reason breakdown and never uses ratings or placement. It is not an admission prediction, and the disclaimer stays. EMI, total cost and eligibility tools keep their rules and ranges. | 10 Oct 2026 |
| Q10 | **Subtle CSS-only entrance motion:** below-the-fold sections fade up about 8px using scroll-driven CSS (`animation-timeline: view()`) behind `@supports`. No JavaScript, never hidden when unsupported, nothing above the fold, and off under `prefers-reduced-motion`. | 10 Oct 2026 |
| Q11 | **Two hubs in the design's hub layout:** `/online-degree-guides` (68 programme guides; pills Fees / Eligibility / Careers / Approvals) and `/blog` (26 CMS articles; pills by article category). Both get a featured card, card grid and tool tiles, and keep their URLs, search and filters. The header's Guides menu links to both. | 10 Oct 2026 |
| Q12 | **Regulator logos kept, with context:** the hero "Approvals that matter" strip stays as designed with "How we verify →". The footer badges get a "How we verify →" link too. The footer line becomes "India's unbiased marketplace for online degrees from UGC-entitled universities. Compare, get counselled, enrol — all free." | 10 Oct 2026 |
| Q13 | **Status labels:** amber "CONFIRM WITH THE UNIVERSITY", green "SOURCE VERIFIED" and "BEING RE-CHECKED" in the design's tag style. Each shows only where the record actually has that status (e.g. `dataQuality.eligibility === 'verified'`, published recognition). The same three are used in the How we verify table. | 10 Oct 2026 |
| Q14 | **Compare: Share link and Print / Save as PDF; no email report.** Share copies the URL (ids only) and shows "Link copied". Print uses a print stylesheet; the table is printable only once unlocked. The design's email-report panel is replaced by "Explore more options" and the newsletter sign-up. | 10 Oct 2026 |
| Q15 | **Hero search = design card plus a text field:** "Course or keyword" (name `q`), then Degree level (`level`) and Stream (`stream`), and "Show programs →". It is a plain GET form to `/courses`, so it works without JavaScript and keeps the site-search target. | 10 Oct 2026 |
| Q16 | **Sticky mobile bars on Course and Home only.** Course pages get the design's bar (fee + EMI and Apply now) below 860px. Home gets a matching bar (Apply now + Browse courses). The tablet floating Apply now pill and the university page's mobile bar are removed. Elsewhere on phones and tablets, Apply now is in the header menu and in page content. | 10 Oct 2026 |
| Scope | **Approved for implementation.** Every public page without a design gets the new design format: total cost planner, eligibility checker, editorial comparisons, the four guide types, author page, newsletter pages, 404 and error pages, Apply modal. **The admin panel (CMS) is restyled too** with the new tokens, buttons, forms and tables (adds about 3–4 days). | 10 Oct 2026 |
| Q17 | About page H1 keeps the approved footer line, "unbiased" included. | 11 Oct 2026 |
| Q18 | /lead eyebrow "Free counselling · No obligation" kept as designed. | 11 Oct 2026 |
| Q19 | University Key highlights: remove "Online learners" only; keep "Annual fee from", "Batches" and "Exams". | 11 Oct 2026 |
| Q20 | University detail layout (owner request): below the programs, every section is one full-width panel, in the order Rankings & recognition (NIRF banner plus equal approval tiles), Admission process (horizontal stepper on wide screens), Placements, Scholarships, then Before choosing with Sources. The two-column pairs are gone, and the section tabs follow the same order. | 11 Oct 2026 |
| Q21 | Course pages: remove the learner-count line ("… learners across MUJ online programs") from the "Why learners pick" sidebar, consistent with Q19. Learner counts no longer appear on public pages. | 12 Oct 2026 |
| Q22 | Error tint for "does not meet" tool results kept: #FEF3F2 background with #B42318 text (passes contrast). Added as the `--uv-error-bg` token next to `--uv-error`. | 12 Oct 2026 |
| Q23 | Find my course: build answers-in-URL (spec §1.3 #17). The five answers are written to the query string; opening the link restores the answers and results. No personal data goes in the URL. | 12 Oct 2026 |
| Q24 | EMI calculator prefill: course pages link with `?course=<id>`, and the calculator pre-selects that published program. Unknown ids are ignored. | 12 Oct 2026 |
| Q25 | Find my course budget question keeps the current three bands (Q9). | 12 Oct 2026 |
| Q26 | Apply now form labels stay "Name" and "Phone". | 12 Oct 2026 |
| Q27 | Apply now form: add inline per-field error messages under each field, shown on blur and on submit and linked with aria-describedby. The validation rules are unchanged. | 12 Oct 2026 |
| Q28 | The article newsletter box's duplicate styling was removed from company.css. guides.css now holds all of it; the box looks the same. | 12 Oct 2026 |
| Q29 | Prune the per-area stylesheets (`src/styles/ui/*.css`) the same way as globals.css: only rules whose classes no file mentions. | 12 Oct 2026 |
