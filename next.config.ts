import type { NextConfig } from "next";

// Gap checklist: "Add security headers and browser protections." Confirmed by direct audit
// that this config had zero security headers before this change -- no CSP, frame policy,
// referrer policy, or anything else.
//
// The public form pages ("f/[slug]" and "public-form/[id]") need a deliberately relaxed frame
// policy -- see src/components/forms/EmbedCodeDialog.tsx, which hands tenants a ready-made
// <iframe> snippet to embed those exact pages on their OWN external websites, an arbitrary,
// unknown-in-advance set of origins a blanket X-Frame-Options: DENY would break outright.
// Next.js only overrides a header VALUE when a later rule sets the SAME key for an overlapping
// path (confirmed against the docs and empirically: a later rule that omits a key does NOT
// clear an earlier rule's value for it, it only wins for keys it actually lists) -- so
// X-Frame-Options can't be "unset" for those two routes by a second, more specific rule the
// way Content-Security-Policy's single combined value can. The general rule's `source` below
// instead uses a negative-lookahead to never match those two path prefixes in the first
// place, verified live via curl against a running build (see the checklist writeup for the
// exact header dump) rather than trusted on regex syntax alone.
const CSP_DEFAULT =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline'; " + // NO_FLASH_SCRIPT in app/layout.tsx is a genuine inline <script>; a nonce-based CSP would need per-request middleware plumbing this pass doesn't attempt
  "style-src 'self' 'unsafe-inline'; " + // Tailwind arbitrary values, inline style={{}} usage, and MUI/Emotion's runtime-injected <style> tags (this app is mid-migration off MUI) all need this
  "img-src 'self' data: blob: https:; " + // user-uploaded avatars/attachments/QR codes (data:) and third-party-hosted images referenced in records
  "font-src 'self' data:; " +
  "connect-src 'self'; " + // confirmed by grep: no frontend code calls an external API/WebSocket directly, everything routes through this app's own /api
  "frame-src 'self'; " +
  "frame-ancestors 'none'; " + // the default: nothing may iframe the app itself
  "base-uri 'self'; " +
  "form-action 'self'; " +
  "object-src 'none'";

// No frame-ancestors restriction at all (any site may embed these) and no X-Frame-Options,
// matching the embed feature's actual requirement -- a tenant's customers' websites are
// arbitrary, unknown-in-advance origins, so an allowlist isn't possible here.
const CSP_EMBEDDABLE_FORM =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob: https:; " +
  "font-src 'self' data:; " +
  "connect-src 'self'; " +
  "base-uri 'self'; " +
  "form-action 'self'; " +
  "object-src 'none'";

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Content-Security-Policy", value: CSP_DEFAULT },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const EMBEDDABLE_FORM_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Content-Security-Policy", value: CSP_EMBEDDABLE_FORM },
];

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@mui/material",
    "@mui/system",
    "@mui/utils",
    "@mui/icons-material",
    "@mui/x-data-grid",
    "@mui/x-date-pickers",
  ],
  experimental: {
    optimizePackageImports: [],
    webpackBuildWorker: false,
  },
  async headers() {
    return [
      { source: "/:path((?!f/|public-form/).*)*", headers: SECURITY_HEADERS },
      { source: "/f/:slug*", headers: EMBEDDABLE_FORM_HEADERS },
      { source: "/public-form/:id*", headers: EMBEDDABLE_FORM_HEADERS },
    ];
  },
};

export default nextConfig;
