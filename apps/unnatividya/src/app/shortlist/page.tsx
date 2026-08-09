import type { Metadata } from "next";
import Link from "next/link";
import { ShortlistView } from "@/components/shortlist-view";
import { courses } from "@/data/catalog";

export const metadata: Metadata = {
  title: "Your Shortlist",
  description: "Courses you've saved for later.",
  robots: { index: false, follow: false },
};

export default function ShortlistPage() {
  const shell = { maxWidth: 1200, margin: "0 auto", paddingLeft: 24, paddingRight: 24, width: "100%", boxSizing: "border-box" as const };

  return (
    <div style={{ background: "#F7F8F9", flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #EAEAEA" }}>
        <div style={{ ...shell, paddingTop: 28, paddingBottom: 28 }}>
          <div style={{ fontSize: 12, color: "#707070", marginBottom: 8 }}>
            <Link href="/" style={{ color: "#707070" }}>Home</Link> &gt; Shortlist
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#363634", margin: 0 }}>Your shortlist</h1>
          <div style={{ fontSize: 14, color: "#696868", marginTop: 6 }}>Saved on this device — tap the heart on any course to add or remove it.</div>
        </div>
      </div>
      <div style={{ ...shell, paddingTop: 28, paddingBottom: 64, flex: 1 }}>
        <ShortlistView courses={courses} />
      </div>
    </div>
  );
}
