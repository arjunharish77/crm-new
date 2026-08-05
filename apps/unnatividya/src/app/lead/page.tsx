import type { Metadata } from "next";
import { LeadFormLoader } from "@/components/lead-form-loader";

export const metadata: Metadata = {
  title: "Request Guidance",
  robots: { index: false, follow: false },
};

export default function LeadPage() {
  return (
    <section className="section alt">
      <div className="container">
        <div className="card" style={{ maxWidth: 520, margin: "0 auto", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid #D3D9EA" }}>
            <div>
              <div style={{ color: "#363634", fontSize: 18, fontWeight: 700 }}>Get free expert counselling</div>
              <div style={{ color: "#696868", fontSize: 13, marginTop: 2 }}>Free counselling · No spam, ever</div>
            </div>
          </div>
          <div style={{ padding: "20px 24px 24px" }}>
            <LeadFormLoader />
          </div>
        </div>
      </div>
    </section>
  );
}
