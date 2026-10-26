import type { Metadata } from "next";
import { AdminLoginForm } from "@/components/admin-login-form";
import Image from "next/image";

export const metadata: Metadata = {
  title: "CMS Login",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLoginPage() {
  return (
    <section className="admin-shell admin-auth">
      <div className="container">
        <div className="card admin-card">
          <Image src="/brand/unnatividya-logo-gradient.svg" alt="Unnati Vidya" width={172} height={28} className="admin-auth-logo" priority />
          <span className="eyebrow">CMS</span>
          <h1 className="admin-auth-title">
            Admin login
          </h1>
          <p>Sign in with your CMS password. This website account is separate from your CRM login. If two-step verification is enabled, you’ll also enter a code sent to your email.</p>
          <AdminLoginForm />
        </div>
      </div>
    </section>
  );
}
