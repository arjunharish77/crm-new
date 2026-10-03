# Read-only audit evidence — 29 September 2026

Target: https://unnatividya.com, provisionally inferred from site configuration.

- `results.json`: 10 public routes × 390/1440px, status/title/H1/canonical, document overflow and broken-loaded-image checks.
- `detail.json`: mobile axe WCAG-tagged checks, page heights, uncontrolled browser timings and initial modal focus. The guessed `/online-degree-guides/online-mba-fees` is a 404, not a guide-template test.
- `flows.json`: robots/sitemap/404 checks, actual guide links, completed recommender, modal first Tab, filter URL behavior.
- `home-mobile.png`, `counselling-mobile.png`: 390×844 viewport screenshots inspected during audit.

Chromium headless with Playwright. Non-GET requests were blocked. No OTP/enquiry was submitted; analytics POST delivery was consequently not tested. Browser timing values are not Lighthouse or field Core Web Vitals. Screenshots are samples, not all-breakpoint coverage. `wide` descendants can be inside intentional scroll containers and are not independently confirmed overflow bugs. Zero automatic accessibility violations does not establish conformance.

Scripts used were temporary audit helpers; no application source/config/data was changed. See the master plan for scope, limitations and approval gates.
