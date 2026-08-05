import type { Metadata } from "next";
import "@/styles/globals.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StickyCtas } from "@/components/sticky-ctas";
import { Analytics } from "@/components/analytics";
import { JsonLd } from "@/components/json-ld";
import { LeadWizardModal } from "@/components/lead-wizard-modal";
import { searchVerification, siteUrl } from "@/lib/seo-config";

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
  alternates: {
    canonical: "/",
  },
  verification: {
    google: verification.google || undefined,
    other: verification.bing ? { "msvalidate.01": verification.bing } : undefined,
  },
  icons: {
    icon: [
      { url: "/brand/favicon.ico", sizes: "any" },
      { url: "/brand/favicon-32x32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
  openGraph: {
    title: "Unnati Vidya",
    description: "Find and compare UGC-approved online degree programs.",
    url: host,
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
    sameAs: [],
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "Admissions counselling",
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
    <html lang="en-IN">
      <body>
        <Analytics />
        <JsonLd data={[organizationJsonLd, websiteJsonLd]} />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
        <StickyCtas />
        <LeadWizardModal />
      </body>
    </html>
  );
}
