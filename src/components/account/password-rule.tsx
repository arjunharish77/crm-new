"use client";

import { useEffect, useRef, useState } from "react";
import type { FieldValues, Resolver } from "react-hook-form";
import { Check, Circle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

// The workspace's password rule (UI/UX plan Phase 3, "one password rule"): the same list, checked
// as you type, everywhere a password is set (My account, an expired password at sign-in, a reset
// link). The server checks the same rule on save (lib/server/password-policy).
export type PasswordRule = {
    rules: string[];
    minPasswordLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
};

// The signed-in user's workspace rule, for forms that set a password (null until it loads, or if it
// can't be loaded; the server still checks it on save). Loads when \`enabled\` turns true, e.g. a
// dialog opening.
export function useWorkspacePasswordRule(enabled = true) {
    const [rule, setRule] = useState<PasswordRule | null>(null);
    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        apiFetch<PasswordRule>("/auth/password-policy")
            .then((loaded) => { if (!cancelled) setRule(loaded); })
            .catch(() => { if (!cancelled) setRule(null); });
        return () => { cancelled = true; };
    }, [enabled]);
    return rule;
}

export const PASSWORD_RULE_NOT_MET = "The password doesn't meet your workspace's password rule yet.";

// Wraps a form's resolver so a password that breaks the workspace rule is reported together with
// the form's other errors (the rule loads after the form is created, hence the ref). Pass the rule
// from useWorkspacePasswordRule; the form's password field must be called "password".
export function usePasswordRuleResolver<T extends FieldValues & { password: string }>(resolver: Resolver<T>, rule: PasswordRule | null): Resolver<T> {
    const ruleRef = useRef(rule);
    useEffect(() => { ruleRef.current = rule; }, [rule]);
    const [wrapped] = useState(() => {
        const withRule: Resolver<T> = async (values, context, options) => {
            const result = await resolver(values, context, options);
            if (passwordMeetsRule(ruleRef.current, values.password)) return result;
            return { values: {}, errors: { ...result.errors, password: { type: "workspaceRule", message: PASSWORD_RULE_NOT_MET } } } as Awaited<ReturnType<Resolver<T>>>;
        };
        return withRule;
    });
    return wrapped;
}

export function passwordChecks(rule: PasswordRule, password: string) {
    const checks = [{ label: `At least ${rule.minPasswordLength} characters`, met: password.length >= rule.minPasswordLength }];
    if (rule.requireUppercase) checks.push({ label: "An uppercase letter", met: /[A-Z]/.test(password) });
    if (rule.requireLowercase) checks.push({ label: "A lowercase letter", met: /[a-z]/.test(password) });
    if (rule.requireNumbers) checks.push({ label: "A number", met: /[0-9]/.test(password) });
    if (rule.requireSpecialChars) checks.push({ label: "A symbol, such as ! or #", met: /[^A-Za-z0-9]/.test(password) });
    return checks;
}

export function passwordMeetsRule(rule: PasswordRule | null, password: string) {
    return rule ? passwordChecks(rule, password).every((check) => check.met) : password.length > 0;
}

export function PasswordRuleList({ rule, password, id }: { rule: PasswordRule | null; password: string; id: string }) {
    if (!rule) return <p id={id} className="text-sm text-muted-foreground">It must meet your workspace&apos;s password rule.</p>;
    return (
        <ul id={id} aria-label="Password rule" className="space-y-0.5 pt-1 text-sm">
            {passwordChecks(rule, password).map((check) => (
                <li key={check.label} className={cn("flex items-center gap-1.5", check.met ? "text-status-success-foreground" : "text-muted-foreground")}>
                    {check.met ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3" aria-hidden />}
                    {check.label}<span className="sr-only">{check.met ? " (met)" : " (not yet)"}</span>
                </li>
            ))}
            {rule.rules.filter((text) => text.startsWith("Not one of")).map((text) => (
                <li key={text} className="flex items-center gap-1.5 text-muted-foreground"><Circle className="size-3" aria-hidden />{text}</li>
            ))}
        </ul>
    );
}
