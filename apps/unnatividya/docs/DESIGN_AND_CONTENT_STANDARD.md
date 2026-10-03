# Unnati Vidya design and content standard

29 September 2026 — proposed standard, awaiting approval. Applies to future public pages, tools and shared interactions. Implement incrementally after approval; do not replace working components merely for visual novelty.

## 1. Principles

A learner should understand what a page offers, whether a program fits, what it costs and what to do next. Show the most useful answer early, expose evidence next to claims and reveal detail when requested. Use recognizable controls and calm visual hierarchy. Prioritize useful information over decorative statistics and repeated sales prompts.

Maintain the existing purple identity. Treat content verification as part of design: “not published,” “needs confirmation” and “last checked” are normal interface states. Never fill gaps with invented figures or imply that a fit estimate is an admission decision.

## 2. Layout and visual tokens

| Area | Proposed standard |
|---|---|
| Page width | Shared 1200px shell, consistent centered alignment. Reading content around 65–75 characters wide; long articles do not span the whole shell. |
| Gutters | 16px small screens; 24px tablet; 32px desktop where space permits. Avoid repeated nested gutters shrinking content. |
| Grid | One column mobile; two/three only when cards retain readable labels. Use `minmax(0, 1fr)` and `min-width: 0` where needed. Content-driven breakpoints, not device names alone. |
| Spacing scale | 4, 8, 12, 16, 24, 32, 48, 64px. Consistent section rhythm; reduce decorative whitespace before hiding useful content. |
| Body typography | 16px default, line height 1.5–1.65. Secondary metadata normally ≥14px; avoid dense 11px core decision facts. |
| Headings | H1 approximately 30–36px mobile / 40–48px desktop; H2 24–30px; H3 18–22px. Adjust by actual text wrapping; do not force giant multi-line mobile slogans. |
| Colors | Preserve existing purple/ink/background tokens; use semantic success/warning/error tokens and explicit text labels. Validate each text/background pair. |
| Contrast | Normal text ≥4.5:1, large text ≥3:1, relevant non-text controls ≥3:1. Never rely on color alone. |
| Shape | Existing 8px cards and 4px controls may remain; consistent radius by component type. Restrained borders and shadows; gradients reserved for purposeful emphasis. |
| Interaction size | Aim for ≥44×44px touch controls; meet WCAG 2.2 minimum target requirements. Small icon graphics may sit inside larger hit areas. |
| Motion | Short functional transitions; respect reduced motion. No fake processing delays, autoplay distractions or layout-moving promotions. |

Centralize these as tokens/shared components rather than new per-page inline values. Exceptions require a reason and a screenshot at narrow width.

## 3. Navigation and wayfinding

Primary navigation: Courses, Universities, Compare, Resources, Tools. Saved courses and **Apply now** are utilities. All generic application/lead-entry CTAs use the exact label **Apply now**, including header, mobile navigation, sticky bars, cards, articles, tools and recommender results. Keep distinct actions such as Search, Save and Compare correctly named. Group children with short explanations, not enormous menus. Mark current location visibly and semantically with `aria-current`.

Mobile navigation must support Escape, logical focus, close on navigation and clear expand/collapse state. Do not bury core discovery under several menu levels. Provide a skip-to-content link, semantic landmarks and descriptive breadcrumbs.

Keep header, section navigation, floating controls and bottom action bar on a documented stacking scale. Show one contextual sticky action region at a time. Suppress floating CTAs behind modal/filter sheets; reserve safe-area and bottom padding so controls never cover the last item or validation message. Anchored headings need correct sticky-header scroll offset.

## 4. Page and card contracts

### Listing page

Order: breadcrumb → title and scope → search/filter/sort → active filters/result count → results → pagination/help. Promotional comparisons must not push the search/results excessively far down a phone screen.

Cards share the same field order: degree and university; suitability/level; full fee and duration; at most two meaningful differentiators; source/freshness state; View details; Compare and Save. **Apply now** is the consistent application-entry label; keep it secondary to View details on discovery cards. Do not present every metadata field as a badge. Use rating only when provenance is established.

Filters must be labeled, reflect URL state, survive back navigation and clear predictably. Show applied filters outside a closed sheet. Mobile filters have a visible heading, close/reset and result action, internal scrolling and focus management. Invalid parameters recover safely. Zero results explain how to broaden the search.

### Detail page

Order: identity and decision summary → on-page navigation → suitability/eligibility → curriculum and learning experience → full cost → recognition → admission steps → support/outcomes → evidence/reviews → related alternatives/FAQs.

Exact ordering can vary with user research; stable labels matter. Essential fee, eligibility and recognition information must be accessible without login. Desktop enquiry rail becomes one contextual mobile action, not repeated full forms after every section.

### Comparison

Editorial comparison articles, including curated university/program comparison pages, remain public and readable without verification. Only the interactive comparison tool is locked until form submission and successful email OTP verification. Explain the requirement before entry; use **Apply now** for the form CTA and retain the selected courses throughout contact details, preferences and verification. Return to the comparison after success. Locked results must not remain focusable or readable behind a visual blur. Use server-validated verification state; failed verification must not unlock results.

Compare like with like. Align fee periods, currencies, duration units and recognition scope. Label missing data. Group rows and support differences-only view. On mobile use a usable two-course view or stacked categories; if scrolling is needed, retain row context and give a visible scroll cue. Provide “Change course” and “Remove” with names.

A cheapest price is not automatically best value. Explain criteria for highlighting. Avoid universal winners where learner priorities differ.

### Guide/article

Unique title and purpose; short direct answer; exact byline **Content Team, Unnati Vidya**, linked to a truthful team profile, and actual publication/update dates; navigable contents for long pages; useful tables/examples; primary sources beside important claims; related course/tool links; a clear next step. Do not pad text for word-count targets or repeat generic FAQs on every program.

## 5. Forms, dialogs and state handling

Use visible labels, appropriate autocomplete/input modes, clear required/optional markings and plain-language field-level errors. Preserve valid input after failure. Focus the first error and summarize failures where needed. Do not use placeholder text as the only label.

The application flow always starts with **Name, Email, Phone** (step 1), followed by **Course** (required dropdown) and **University** (optional dropdown, default “No preference”) on step 2. Submitting step 1 with explicit contact consent saves the lead for CRM follow-up. Staff may contact the learner even if preferences or email verification remain unfinished. Explain this beside an unchecked consent control before Continue; keep marketing consent separate and show incomplete/unverified statuses in CRM. Step 2 updates the same lead, and email verification follows. Show save failures and pending CRM delivery truthfully; retries must not create duplicates. Context can preselect preferences but must never skip the contact-first page. Course changes reset incompatible university choices; Back retains values. Use accessible native selects initially. The entry CTA is **Apply now**; in-flow controls use Continue, Back, Submit details and Verify email as appropriate. Explain that this starts an application enquiry, not confirmed university admission. Full persistence, CRM mapping and verification requirements are in master plan §14.1.

Email OTP remains after the preferences submission and must be described as email verification. Explain whether an enquiry is already saved before verification. Provide retry/resend/change-address states, disabled submit while pending, and protection against duplicate accepted submissions. Success copy reflects actual backend state, including delayed CRM sync.

Dialogs/sheets: accessible name, initial focus inside, keyboard focus containment, Escape, visible close, background inertness, scroll lock and focus restoration. Tall mobile forms scroll internally and remain usable with the keyboard. Backdrop clicks should not silently discard significant entered data. Do not send personal information through query strings to prefill flows.

Every shared component defines default, hover, focus, selected, disabled, loading, empty, error and success states where applicable. Loading should preserve layout; errors give an actionable recovery. Do not show empty charts or silent blank sections when data is absent.

## 6. Content and claims

Use plain learner language: “total program fee,” “who can apply,” “weekly study time,” and “how exams work.” Expand acronyms on first use. Distinguish degree, specialization, elective, university and delivery platform.

Show fee components and their applicability; label indicative estimates, financing assumptions and lender approval conditions. Never promise “no-cost EMI for everyone” or guaranteed employment. Outcomes identify cohort, online/on-campus scope, reporting period, source and method. Reviews identify relevant program and permissioned source; aggregate values derive from actual underlying reviews.

Recognition displays program/session-specific evidence where required, a source and last checked date. Institutional accreditation logos must not imply approval of every listed program or universal overseas/job eligibility. Complex recognition claims require editorial verification, not automatic generation.

Avoid invented urgency, fake availability, stale deadlines, “most popular” without a defined basis, and unsubstantiated impartiality claims. If compensation influences coverage or ordering, disclose it. Recommender explanations must match the actual calculation and limitations.

## 7. Accessibility and responsive acceptance

Target WCAG 2.2 AA using the [W3C reference](https://www.w3.org/WAI/WCAG22/quickref/). Automated checks supplement manual tests; neither zero axe issues nor a high Lighthouse score certifies accessibility.

Test 320/360/390/768/1024/1280/1440px, landscape, 200% zoom and 320 CSS-pixel reflow. Test long names, translations, large system text and virtual keyboards. Only intentional data regions may scroll sideways; their controls and content remain keyboard accessible. Hiding overflow is not a fix for clipped content.

All actions must work without a pointer. Visible focus must not be hidden by sticky regions. Use semantic buttons/links/tables/headings. Announce result counts and asynchronous errors without repeatedly interrupting assistive technology. Images have meaningful alternatives or empty alt if decorative. Chart/tool summaries have textual equivalents.

## 8. Performance and maintainability

Use existing framework primitives and shared components. Default to server/static content, adding client state only where needed. Keep images responsive with dimensions and suitable delivered sizes. Prioritize the LCP asset; defer below-fold/third-party work. Avoid importing the full enriched catalog globally just to display a label.

Create shared PageShell, PageIntro, CourseCard, UniversityCard, FeeSummary, VerificationStatus, SourceList, FilterSheet, ComparisonSection, Dialog, FormField, EmptyState and ContextualActionBar components as reuse justifies them. Do not introduce a large UI dependency solely to restyle a few controls.

Changes need representative visual snapshots, relevant behavioral tests and production build verification. New dependencies require purpose, maintenance and bundle-impact review. Preserve URL contracts and explicit loading/error behavior.

## 9. Design review and definition of done

Before implementation, review home, listing, detail, comparison and enquiry flows at mobile and desktop sizes. Approve content density and hierarchy with real long names, fees and missing-data examples, not perfect mock data.

A change is ready when the learner task works, content has evidence, narrow/zoom layouts hold, keyboard/focus behavior is correct, tracking is intentional, SEO metadata is appropriate and the production build passes. Document exceptions with an owner and a follow-up condition.

The master plan supplies priorities and phases. This standard supplies consistency; it does not authorize implementation or require replacing correct existing work.


## 10. Subtle motion and richer information

Use motion to explain state changes: 120–160ms hover/focus transitions; 160–220ms dropdown, accordion and step transitions; 180–240ms modal/sheet entry. These are proposed tokens, not required delays. Prefer opacity and transforms with small 4–8px movement. Keep focus immediate and consistent; interaction must not wait for animation completion. Do not animate page-wide layout, use parallax, scroll hijacking, auto-advancing carousels, looping hero motion or decorative delays. Do not add a motion library unless CSS cannot meet the requirement economically.

Honor `prefers-reduced-motion`: remove translation and smooth scrolling, make state changes immediate or use a minimal fade. Content is present and readable if animation/JavaScript fails. Reserve dimensions to prevent layout shifts. Loading indicates real work; Groq requests have clear progress, timeout/fallback and retry without simulated thinking delays. Validate on a low-end mobile profile and keyboard, not only a fast desktop.

Expand course/university pages with sourced curriculum, teaching/exam details, costs, admission documents, support and recognition evidence. Use summary → section navigation → detailed blocks, tables and secondary accordions. Keep essential content in rendered HTML and accessible without opening a lead form. Do not collapse the entire page into accordions or increase first-screen clutter.

Asset use follows [ASSET_REQUIREMENTS_AND_PROMPTS.md](ASSET_REQUIREMENTS_AND_PROMPTS.md). Generated illustrations are decorative/explanatory; they cannot stand in for real campuses, certificates, alumni, reviewers, accreditation marks or university partnerships. Every blog/article author remains **Content Team, Unnati Vidya**, with consistent Organization authorship in structured data.


## 11. Admin publishing experience

Confirmed direction: staff publish reviewed course, fee, deadline and university updates through the admin panel without routine code deployment. Clearly distinguish Draft, In review, Published and Archived. Provide a public-page preview, source/last-checked fields, readable before/after changes, visible validation errors, publication status, revision history and rollback. Only website administrators can publish, schedule, unpublish or roll back live content. Editors can prepare and preview drafts and submit them for review; failed publication retains the draft and does not claim success. Manual and scheduled official-source checks create reviewable drafts; neither publishes automatically. Show old/new facts, source links, conflicts and errors, plus last successful check and next scheduled check. Scheduled checks default to weekly. Administrators can change or pause the schedule and run manual checks anytime; show the configured day, time and timezone. Public pages and the AI recommender use only approved published content.


## 12. International/NRI fee presentation

Include dedicated international/NRI fees alongside domestic fees where verified. Use a clearly labeled fee-category selector and show original currency, payment period, mandatory extras, source and last-checked date. Preserve university-specific category distinctions and do not infer fee eligibility from location or phone code. Keep comparison categories aligned, mark missing fees “Confirm with university,” and never substitute converted domestic prices. Fee context may carry into the application as a preference without changing Name/Email/Phone first, then Course and optional University. Detailed sourcing and acceptance criteria are in master plan §14.8.


## 13. First-release language

Use English throughout the first release, including international/NRI fee information, application forms and AI responses. Hindi and other translations are deferred. Do not show nonfunctional language controls. Accept Unicode names and international contact details, and keep copy suitable for future localization.


## 14. Free AI recommendations

Learners can use the Groq course recommender and see recommendations without providing name, email or phone or verifying an email address. Show clear explanations, sources, uncertainty and an **Apply now** action that opens the contact-first form with the selected course context retained. Do not create a lead from quiz/chat use alone. If the learner chooses the interactive comparison tool, its separate form-and-email-verification gate still applies; editorial comparison articles remain public. Handle public-use limits and provider failures with a clear retry or non-AI fallback rather than an unexpected lead-capture gate.


## 15. Deferred verification of existing claims

Owner decision: keep existing visible ratings, testimonials and placement/salary figures for now, with verification deferred. This is an exception for existing content, not approval to invent or expand claims. Track these items internally as pending review; do not add verified badges or describe them as newly verified. Keep them out of verified AI recommendation evidence until substantiated. Review rating/review structured data independently against applicable requirements. Core fee, eligibility, recognition and deadline verification continues. See master plan §14.10.


## 16. Lead capture only

Appointment booking is excluded from the current scope. Do not introduce calendar slots, booking controls or meeting confirmations. Apply now starts the agreed lead-capture flow; success confirms receipt and staff follow-up without implying a booked appointment or confirmed admission. Preserve all agreed consent, step-1 saving, verification and comparison-access behavior.

## Curriculum evidence and labels

Only a course-specific, reviewed syllabus may use definitive semester labels. Until `dataQuality.curriculum` is reviewed and marked verified, show **Illustrative study areas**, explain that the outline is provisional, and use group labels. Do not infer elective timing from a shared template. An equal semester count is not subject-level verification.

Record eligibility evidence by student category and distinguish visible admissions requirements from structured metadata. A search result or historical regulator row is not current-session confirmation. Match program, awarding institution/location, learning mode and admission session before updating recognition claims.
