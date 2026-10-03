"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Section } from "@/components/common/section";
import { PasswordSection } from "@/components/account/password-section";
import { TwoFactorSection } from "@/components/account/two-factor-section";
import { SessionsSection } from "@/components/account/sessions-section";

// Sign-in & security: Password, Two-factor and Sessions on one page, each linkable
// (#password, #two-factor, #sessions). They were three admin-only Settings pages.
export default function AccountSecurityPage() {
    return (
        <div className="min-w-0">
            <PageHeader title="Sign-in & security" description="Your password, two-factor sign-in and the devices signed in as you." />
            <Section layout="split" id="password" title="Password" description="Use a password you don't use anywhere else.">
                <PasswordSection />
            </Section>
            <Section layout="split" id="two-factor" title="Two-factor sign-in" description="A code from an authenticator app as well as your password.">
                <TwoFactorSection />
            </Section>
            <Section layout="split" id="sessions" title="Sessions" description="Sign out a device you've lost or no longer use.">
                <SessionsSection />
            </Section>
        </div>
    );
}
