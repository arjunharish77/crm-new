const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "src", "styles", "globals.css"), "utf8");
const leadPage = fs.readFileSync(path.join(root, "src", "app", "lead", "page.tsx"), "utf8");
const loader = fs.readFileSync(path.join(root, "src", "components", "lead-form-loader.tsx"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(css.includes("@media (max-width: 900px)"), "Missing primary mobile breakpoint");
assert(css.includes(".grid.three") && css.includes("grid-template-columns: 1fr"), "Grid collapse rule is missing");
assert(css.includes(".search-panel") && css.includes("flex-direction: column"), "Search panel mobile stacking is missing");
assert(css.includes(".article-layout") && css.includes("grid-template-columns: 1fr"), "Article layout mobile stacking is missing");
assert(css.includes(".admin-grid") && css.includes("grid-template-columns: 1fr"), "Admin grid mobile stacking is missing");
assert(
  css.includes(".sticky-ctas") && css.includes("right: 12px") && css.includes("bottom: 12px") && css.includes("left: auto"),
  "Sticky CTA mobile positioning is missing"
);
assert(css.includes(".callback-pill") && css.includes("width: 58px"), "Floating callback button sizing is missing");
// Viewport units are allowed only inside clamp() with fixed limits, which still scales with browser zoom.
assert(!/font-size:[ \t]*(?![ \t]|clamp\()[^;]*(vw|vh)/.test(css), "Viewport-scaled font-size found outside clamp()");
// The application page was rebuilt in increment 41 (form beside its explanation); its layout is covered
// at 320–1280px by application-accessibility-smoke.cjs, so only its presence is checked here.
assert(leadPage.includes("LeadForm") || leadPage.includes("lead-form"), "Application page must render the lead form");
assert(loader.includes("next/dynamic"), "Lead form should be dynamically loaded");

console.log("Mobile/static UI smoke passed.");
