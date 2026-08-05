import Link from "next/link";
import { Phone } from "lucide-react";

export function StickyCtas() {
  return (
    <div aria-label="Quick actions" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 150, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
      <Link
        href="/lead?intent=request-callback"
        data-open-lead
        aria-label="Request a callback"
        title="Request a callback"
        style={{ width: 48, height: 48, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "1.5px solid #544CC8", color: "#544CC8", borderRadius: 999, boxShadow: "0 4px 8px rgba(36,36,36,0.12)" }}
      >
        <Phone size={22} strokeWidth={2.5} aria-hidden="true" />
      </Link>
      <Link
        href="https://wa.me/917303088694"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="WhatsApp enquiry"
        title="Chat on WhatsApp"
        style={{ width: 48, height: 48, borderRadius: "50%", background: "#25D366", boxShadow: "0 4px 8px rgba(36,36,36,0.16)", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 448 512" fill="#fff">
          <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32 101.5 32 1.9 131.6 1.9 254c0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.1c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.5-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.7-16.4-54.2-29.2-75.8-66.2-5.7-9.8 5.7-9.1 16.4-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.5-19.4 19-19.4 46.3s19.9 53.7 22.6 57.4c2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.4-6.6z" />
        </svg>
      </Link>
    </div>
  );
}
