const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
// The legacy sheet plus the UI-redesign sheets (src/styles/ui/*.css), all loaded by the root layout.
const uiDir = path.join(root, "src", "styles", "ui");
const css = [fs.readFileSync(path.join(root, "src", "styles", "globals.css"), "utf8"),
  ...fs.readdirSync(uiDir).filter((file) => file.endsWith(".css")).map((file) => fs.readFileSync(path.join(uiDir, file), "utf8"))].join("\n");
const leadPage = fs.readFileSync(path.join(root, "src", "app", "lead", "page.tsx"), "utf8");
const loader = fs.readFileSync(path.join(root, "src", "components", "lead-form-loader.tsx"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(css.includes("@media (max-width: 900px)"), "Missing primary mobile breakpoint");
// UI redesign: card grids are fluid (one column on phones without a breakpoint); page layouts are
// checked for horizontal overflow at 320–1440px by the browser suites.
assert(/\.uv-card-grid \{[^}]*minmax\(min\(100%, /.test(css), "Fluid card grid rule is missing");
assert(css.includes(".admin-grid") && css.includes("grid-template-columns: 1fr"), "Admin grid mobile stacking is missing");
// UI redesign: the header switches to the menu below 1080px; the sticky mobile bar (Home and course
// pages only, Q16) appears below 860px and reserves space at the end of the page.
assert(css.includes("@media (max-width: 1079px)") && css.includes(".uvh-mobile-only"), "Header mobile breakpoint is missing");
assert(css.includes("@media (max-width: 859px)") && css.includes(".uv-mobile-bar") && css.includes("body:has(.uv-mobile-bar)"), "Mobile action bar rule is missing");
assert(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 0\.01ms !important/.test(css), "Global reduced-motion rule is missing");
assert(css.includes("@media print") && css.includes(".uv-reveal { animation: none !important"), "Entrance motion must be disabled for print");
// Viewport units are allowed only inside clamp() with fixed limits, which still scales with browser zoom.
assert(!/font-size:[ \t]*(?![ \t]|clamp\()[^;]*(vw|vh)/.test(css), "Viewport-scaled font-size found outside clamp()");
// The application page was rebuilt in increment 41 (form beside its explanation); its layout is covered
// at 320–1280px by application-accessibility-smoke.cjs, so only its presence is checked here.
assert(leadPage.includes("LeadForm") || leadPage.includes("lead-form"), "Application page must render the lead form");
assert(loader.includes("next/dynamic"), "Lead form should be dynamically loaded");

console.log("Mobile/static UI smoke passed.");
