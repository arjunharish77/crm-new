"use client";

import { useCallback, useMemo } from "react";
import { useAuth } from "@/providers/auth-provider";
import { canUseModule, effectiveModuleLevels, type ModuleNeed } from "@/lib/module-access";

// The same role module rule the server enforces (lib/module-access.ts), for hiding what a role
// can't use. `can("leads")` = may see leads; `can("leads", "write")` = may add and change them.
export function useModuleAccess() {
    const { user } = useAuth();
    const levels = useMemo(() => effectiveModuleLevels(user as any), [user]);
    // Until the user has loaded nothing is hidden or blocked (the server enforces regardless).
    return useCallback((key: string, need: ModuleNeed = "read") => !user || canUseModule(user as any, key, need, levels), [user, levels]);
}
