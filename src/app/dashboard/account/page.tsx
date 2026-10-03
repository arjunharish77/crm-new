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

function roleLabel(role: unknown) {
    if (typeof role === "string") return role;
    if (role && typeof role === "object" && "name" in role) return String((role as { name?: unknown }).name ?? "");
    return "";
}

// My account › Profile (UI/UX plan decision 8). Your name is yours to change; email, role and
// team are set by an admin.
export default function AccountProfilePage() {
    const { user, login } = useAuth();
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => { setName(user?.name ?? ""); }, [user?.name]);

    const dirty = name.trim().replace(/\s+/g, " ") !== (user?.name ?? "");
    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        if (!name.trim()) { setError("Enter your name."); return; }
        setSaving(true);
        try {
            await apiFetch("/auth/me", { method: "PATCH", body: JSON.stringify({ name }) });
            await login();
            toast.success("Name saved");
        } catch (caught: any) {
            setError(caught?.message || "Your name couldn't be saved.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-w-0">
            <PageHeader title="Profile" description="How you appear to your colleagues." />
            <Section layout="split" id="name" title="Your name" description="Shown on records you own, activities you log and in mentions.">
                <form onSubmit={save} className="max-w-md space-y-3" noValidate>
                    <div className="space-y-1.5">
                        <Label htmlFor="profile-name">Name</Label>
                        <Input id="profile-name" autoComplete="name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} aria-invalid={!!error || undefined} aria-describedby={error ? "profile-name-error" : undefined} />
                        {error ? <p id="profile-name-error" role="alert" className="text-sm text-destructive">{error}</p> : null}
                    </div>
                    <div className="flex gap-2">
                        <Button type="submit" isLoading={saving} disabled={!dirty}>Save name</Button>
                        {dirty ? <Button type="button" variant="outline" onClick={() => { setName(user?.name ?? ""); setError(""); }}>Discard</Button> : null}
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
