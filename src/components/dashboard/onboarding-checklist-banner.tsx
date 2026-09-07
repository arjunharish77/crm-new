"use client";

// Gap checklist Module 10's "guided onboarding and demo mode" item -- the "module readiness
// checklist" and "first-run setup tasks" sub-items, built as one real, dismissible banner rather
// than a DOM-overlay product tour (no such library exists in this app, and there's no self-serve
// signup flow to hook a "first run" event into anyway -- tenants are platform-admin-provisioned,
// so this shows on every login until an admin completes or dismisses it, which IS the "first
// run" for a newly provisioned tenant in practice).
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type OnboardingChecklistItem = { key: string; label: string; description: string; done: boolean; href: string };
type OnboardingReadiness = { items: OnboardingChecklistItem[]; completedCount: number; totalCount: number; dismissed: boolean };

export function OnboardingChecklistBanner() {
  const { user } = useAuth();
  const isTenantAdmin = Boolean((user as any)?.isTenantAdmin || (user as any)?.isPlatformAdmin);
  const [readiness, setReadiness] = useState<OnboardingReadiness | null>(null);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (!isTenantAdmin) return;
    apiFetch<OnboardingReadiness>("/onboarding/readiness")
      .then(setReadiness)
      .catch(() => setReadiness(null));
  }, [isTenantAdmin]);

  if (!isTenantAdmin || !readiness || readiness.dismissed || readiness.completedCount >= readiness.totalCount) {
    return null;
  }

  const dismiss = async () => {
    setDismissing(true);
    try {
      await apiFetch("/onboarding/dismiss", { method: "POST" });
      setReadiness((current) => (current ? { ...current, dismissed: true } : current));
    } catch {
      // Best-effort -- worst case the banner reappears on next load, no data loss.
    } finally {
      setDismissing(false);
    }
  };

  return (
    <Card className="mb-4 rounded-2xl border-primary/20 bg-primary/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold">Get your workspace ready</h2>
          <p className="text-xs text-muted-foreground">
            {readiness.completedCount} of {readiness.totalCount} steps complete
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={dismiss} disabled={dismissing} aria-label="Dismiss setup checklist">
          <X className="size-4" />
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {readiness.items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="flex items-start gap-2 rounded-xl border bg-card p-3 transition-colors hover:bg-accent"
          >
            {item.done ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <p className={cn("text-sm font-semibold", item.done && "text-muted-foreground line-through")}>{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}
