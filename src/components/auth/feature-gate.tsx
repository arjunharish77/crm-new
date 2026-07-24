"use client";

import React from "react";
import { useAuth } from "@/providers/auth-provider";

interface FeatureGateProps {
    feature: string;
    children: React.ReactNode;
    fallback?: React.ReactNode;
    invert?: boolean;
}

/**
 * Component to conditionally render content based on tenant feature flags.
 */
export function FeatureGate({
    feature,
    children,
    fallback = null,
    invert = false
}: FeatureGateProps) {
    const { user } = useAuth();

    // Check if user is platform admin (they see everything)
    if (user?.isPlatformAdmin) return <>{children}</>;

    // Default features if not present in user profile (or not present on a
    // partially-populated TenantFeature row — merge rather than replace so a
    // missing column doesn't silently disable a feature that should default on).
    const defaultFeatures: Record<string, boolean> = {
        opportunityEnabled: true,
        automationEnabled: true,
        salesGroupsEnabled: true,
        formBuilderEnabled: true,
        advancedReporting: true,
        apiAccessEnabled: false,
    };

    const features = { ...defaultFeatures, ...user?.features };
    const isEnabled = !!features[feature];

    if (invert) {
        return !isEnabled ? <>{children}</> : <>{fallback}</>;
    }

    return isEnabled ? <>{children}</> : <>{fallback}</>;
}

/**
 * Hook to check if a feature is enabled.
 */
export function useFeature(feature: string): boolean {
    const { user } = useAuth();
    if (user?.isPlatformAdmin) return true;

    const defaultFeatures: Record<string, boolean> = {
        opportunityEnabled: true,
        automationEnabled: true,
        salesGroupsEnabled: true,
        formBuilderEnabled: true,
        advancedReporting: true,
        apiAccessEnabled: false,
    };

    const features = { ...defaultFeatures, ...user?.features };
    return !!features[feature];
}
