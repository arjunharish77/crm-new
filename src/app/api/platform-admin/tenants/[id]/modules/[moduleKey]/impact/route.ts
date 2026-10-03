import { NextResponse } from "next/server";
import { moduleChangeBlockedReason } from "@/lib/module-dependencies";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { getModuleDisableImpact } from "@/lib/server/module-impact";
import { getEffectiveModuleStates } from "@/lib/server/module-entitlements";

// Read-only preview shown before a platform admin disables or suspends a module: what would stop,
// and whether a dependent module currently prevents the change at all.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; moduleKey: string }> }) {
  try {
    await requirePlatformAdmin(request);
    const { id, moduleKey } = await params;
    const [items, { states, names }] = await Promise.all([getModuleDisableImpact(id, moduleKey), getEffectiveModuleStates(id)]);
    const blockedReason = moduleChangeBlockedReason(states, moduleKey, false, (key) => names[key] ?? key);
    return NextResponse.json({ moduleKey, items, blockedReason });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to load module impact", error);
  }
}
