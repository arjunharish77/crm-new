# Unnatify brand assets

The logo: an upward arrow growing out of a U ("unnati" means progress), and the wordmark
"Unnatify" in Figtree (SIL Open Font License) weight 800, converted to outlines.

| File | Use |
|---|---|
| `unnatify-logo.svg` | Full logo for light backgrounds (mark `#1b6c31`, text `#1a1c19`) |
| `unnatify-logo-dark.svg` | Full logo for dark backgrounds (mark `#7fdc8f`, text `#e2e3dd`) |
| `unnatify-mark.svg`, `unnatify-mark-dark.svg` | The square mark alone |
| `unnatify-mark-mono.svg` | The mark in `currentColor`, for one-colour use |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Installed-app icons (`src/app/manifest.ts`) |
| `logo-email.png` | System email header, 600×148 shown at 150×37 (`emailLogoHtml()` in `src/lib/server/system-email.ts`) |
| `logo-pdf.png` | 1200×297, transparent, for documents |

The browser icons are in `src/app` (`favicon.ico` with 16/32/48 px, `icon.png`, `apple-icon.png`,
`opengraph-image.png`); Next.js links them automatically. In the app the logo is the inline
`BrandLogo` / `BrandMark` component (`src/components/brand/brand-logo.tsx`), whose colours follow
light and dark mode through `--brand-mark` and `--brand-ink` in `globals.css`.

Keep clear space around the logo of at least the arrowhead's height, and don't recolour the
mark except in one-colour use.
