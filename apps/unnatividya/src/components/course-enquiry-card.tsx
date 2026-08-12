"use client";

import Link from "next/link";
import { useState } from "react";

// Real, wired fields (previously two decorative inputs that fed nothing -- clicking "Enquire
// now" opened the wizard regardless of what was typed). Building the href with these values as
// query params lets LeadWizardModal pick them up and pre-fill step 2, so the visitor doesn't
// have to retype what they already entered here.
export function CourseEnquiryCard({ courseId }: { courseId: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const params = new URLSearchParams({ course: courseId, intent: "enquire" });
  if (name.trim()) params.set("name", name.trim());
  if (email.trim()) params.set("email", email.trim());
  if (phone.trim()) params.set("phone", phone.trim());

  return (
    <div style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#363634" }}>Get the full fee breakup & brochure</div>
      <div style={{ fontSize: 13, color: "#696868", margin: "6px 0 14px", lineHeight: 1.5 }}>A counsellor will share the brochure, scholarship eligibility and next batch dates.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          placeholder="Full name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          style={{ height: 42, padding: "0 14px", border: "1px solid #CFDAE6", borderRadius: 4, fontSize: 14, color: "#555", outlineColor: "#544CC8" }}
        />
        <input
          placeholder="Email address"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          style={{ height: 42, padding: "0 14px", border: "1px solid #CFDAE6", borderRadius: 4, fontSize: 14, color: "#555", outlineColor: "#544CC8" }}
        />
        <input
          placeholder="Mobile number"
          inputMode="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 14))}
          style={{ height: 42, padding: "0 14px", border: "1px solid #CFDAE6", borderRadius: 4, fontSize: 14, color: "#555", outlineColor: "#544CC8" }}
        />
        <Link href={`/lead?${params.toString()}`} className="btn primary" style={{ width: "100%", height: 44, fontSize: 15 }} data-open-lead>
          Enquire now
        </Link>
      </div>
      <div style={{ fontSize: 11, color: "#707070", marginTop: 10 }}>Free service · no spam · unbiased advice</div>
    </div>
  );
}
