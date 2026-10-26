import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "@/styles/globals.css";
// UI redesign 2026-10: new design-system styles, loaded after the legacy sheet so they win.
import "@/styles/ui/shell.css";
import "@/styles/ui/home.css";
import "@/styles/ui/courses.css";
import "@/styles/ui/compare.css";
import "@/styles/ui/universities.css";
import "@/styles/ui/guides.css";
import "@/styles/ui/tools.css";
import "@/styles/ui/company.css";
import "@/styles/ui/admin.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { HideOnAdmin } from "@/components/hide-on-admin";
import { Analytics } from "@/components/analytics";
import { JsonLd } from "@/components/json-ld";
import { searchVerification, siteUrl } from "@/lib/seo-config";
import { SOCIAL_URLS } from "@/lib/social";

// Self-hosted at build time by next/font (the CSP blocks the Google Fonts CDN). UI redesign Q1.
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: "variable", display: "swap", variable: "--uv-font-sans" });

const host = siteUrl();
const verification = searchVerification();

export const metadata: Metadata = {
  metadataBase: new URL(host),
  title: {
    default: "Unnati Vidya | Compare UGC-Approved Online Degrees",
    template: "%s | Unnati Vidya",
  },
  description:
    "Compare UGC-approved online degrees from Manipal University Jaipur, Sikkim Manipal University, and Amity Online. Check fees, eligibility, specialisations, and get expert guidance.",
  verification: {
    google: verification.google || undefined,
    other: verification.bing ? { "msvalidate.01": verification.bing } : undefined,
  },
  icons: {
    icon: [
      { url: "/brand/favicon.ico", sizes: "any" },
      { url: "/brand/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/brand/android-chrome-192x192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
  // No canonical or og:url here: each page sets its own via withSocial() (technical SEO H4/H5).
  openGraph: {
    title: "Unnati Vidya",
    description: "Find and compare UGC-approved online degree programs.",
    siteName: "Unnati Vidya",
    images: ["/brand/og-default.jpg"],
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Unnati Vidya",
    url: host,
    logo: `${host}/brand/unnatividya-logo-gradient.svg`,
    sameAs: SOCIAL_URLS,
    email: "admin@unnatividya.com",
    address: {
      "@type": "PostalAddress",
      streetAddress: "A-116, URBTECH Trade Centre",
      addressLocality: "Noida",
      addressRegion: "Uttar Pradesh",
      postalCode: "201304",
      addressCountry: "IN",
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "Admissions counselling",
        email: "admin@unnatividya.com",
        areaServed: "IN",
        availableLanguage: ["English", "Hindi"],
      },
    ],
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Unnati Vidya",
    url: host,
    potentialAction: {
      "@type": "SearchAction",
      target: `${host}/courses?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html lang="en-IN" className={jakarta.variable}>
      <body>
        <a href="#main-content" className="skip-content-link">Skip to main content</a>
        <Analytics />
        <JsonLd data={[organizationJsonLd, websiteJsonLd]} />
        <SiteHeader />
        <main id="main-content" tabIndex={-1}>{children}</main>
        <HideOnAdmin>
          <SiteFooter />
        </HideOnAdmin>
      </body>
    </html>
  );
}
