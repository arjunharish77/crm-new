import type { Metadata } from "next";
import { AdminLoginForm } from "@/components/admin-login-form";

export const metadata: Metadata = {
  title: "CMS Login",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLoginPage() {
  return (
    <section className="admin-shell">
      <div className="container">
        <div className="card admin-card">
          <span className="eyebrow">CMS</span>
          <h1 className="section-title" style={{ fontSize: 32 }}>
            Admin login
          </h1>
          <p>Sign in with your CMS password. If admin 2FA is enabled, an email OTP will be sent before the CMS opens.</p>
          <AdminLoginForm />
        </div>
      </div>
    </section>
  );
}
