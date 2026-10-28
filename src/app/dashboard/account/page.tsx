"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { PageHeader } from "@/components/layout/page-header";
import { Section, DescriptionList } from "@/components/common/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidUserPhone, USER_PHONE_ERROR } from "@/lib/user-phone";

function roleLabel(role: unknown) {
    if (typeof role === "string") return role;
    if (role && typeof role === "object" && "name" in role) return String((role as { name?: unknown }).name ?? "");
    return "";
}

// My account › Profile. Agents can update the phone where connector calls ring; email, role
// and team are set by an admin.
export default function AccountProfilePage() {
    const { user, login } = useAuth();
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => { setName(user?.name ?? ""); }, [user?.name]);
    useEffect(() => { setPhone(user?.phone ?? ""); }, [user?.phone]);

    const dirty = name.trim().replace(/\s+/g, " ") !== (user?.name ?? "") || phone.trim() !== (user?.phone ?? "");
    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        if (!name.trim()) { setError("Enter your name."); return; }
        if (!isValidUserPhone(phone)) { setError(USER_PHONE_ERROR); return; }
        setSaving(true);
        try {
            await apiFetch("/auth/me", { method: "PATCH", body: JSON.stringify({ name, phone }) });
            await login();
            toast.success("Profile saved");
        } catch (caught: any) {
            setError(caught?.message || "Your name couldn't be saved.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-w-0">
            <PageHeader title="Profile" description="Your name and the phone your CRM calls ring." />
            <Section layout="split" id="name" title="Your details" description="Your name appears on records and activities. Connectors use your phone for assigned calls unless an admin sets a User-Agent Mapping.">
                <form onSubmit={save} className="max-w-md space-y-3" noValidate>
                    <div className="space-y-1.5">
                        <Label htmlFor="profile-name">Name</Label>
                        <Input id="profile-name" autoComplete="name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} aria-invalid={!!error || undefined} aria-describedby={error ? "profile-name-error" : undefined} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="profile-phone">Phone for CRM calls (optional)</Label>
                        <Input id="profile-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} maxLength={32} onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" aria-invalid={!!error || undefined} aria-describedby={error ? "profile-name-error" : "profile-phone-help"} />
                        <p id="profile-phone-help" className="text-xs text-muted-foreground">Use the country code when possible. A local number uses the phone system’s default country code when dialed.</p>
                    </div>
                    {error ? <p id="profile-name-error" role="alert" className="text-sm text-destructive">{error}</p> : null}
                    <div className="flex gap-2">
                        <Button type="submit" isLoading={saving} disabled={!dirty}>Save profile</Button>
                        {dirty ? <Button type="button" variant="outline" onClick={() => { setName(user?.name ?? ""); setPhone(user?.phone ?? ""); setError(""); }}>Discard</Button> : null}
                    </div>
                </form>
            </Section>
            <Section layout="split" id="account" title="Account" description="Ask an admin if any of these need to change.">
                <DescriptionList items={[
                    { label: "Email", value: user?.email },
                    { label: "Role", value: roleLabel(user?.role) || null },
                    { label: "Workspace", value: (user as any)?.tenantName ?? null },
                    { label: "Two-factor sign-in", value: <Link href="/dashboard/account/security#two-factor" className="text-primary hover:underline">{(user as any)?.mfaEnabled ? "On" : "Off"}</Link> },
                ]} />
            </Section>
        </div>
    );
}
