"use client";

import { useEffect, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { apiFetch } from "@/lib/api";
import { fetchCached } from "@/lib/views-metadata-cache";
import { formatWorkspaceDate, formatWorkspaceDateTime } from "@/lib/date-format";
import { formFieldType } from "@/lib/custom-field-types";

export type CustomFieldDefinition = { id: string; key: string; label: string; type?: string; fieldType?: string; entityTypeId?: string | null; isActive?: boolean; order?: number; options?: string[] };

// The workspace's active custom fields for leads or opportunities (cached for the session).
export function useCustomFieldDefinitions(objectType: "LEAD" | "OPPORTUNITY") {
    const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
    useEffect(() => {
        let active = true;
        fetchCached(`custom-fields:${objectType}`, () => apiFetch<CustomFieldDefinition[]>(`/custom-fields?objectType=${objectType}`))
            .then((rows) => {
                if (!active) return;
                setFields((Array.isArray(rows) ? rows : []).filter((field) => field.isActive !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
            })
            .catch(() => { if (active) setFields([]); });
        return () => { active = false; };
    }, [objectType]);
    return fields;
}

export const customFieldColumnId = (key: string) => `customField:${key}`;

export function formatCustomFieldValue(type: string | undefined, value: unknown) {
    if (value === null || value === undefined || value === "") return null;
    const kind = formFieldType(type);
    if (kind === "BOOLEAN") return value === true || value === "true" ? "Yes" : "No";
    if (kind === "DATE") return formatWorkspaceDate(String(value));
    if (kind === "DATETIME") return formatWorkspaceDateTime(String(value));
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
}

// One list column per custom field, hidden until a user turns it on (customFieldColumnsHidden).
export function buildCustomFieldColumns<T extends { customFields?: Record<string, unknown> | null }>(fields: CustomFieldDefinition[]): ColumnDef<T>[] {
    return fields.map((field) => ({
        id: customFieldColumnId(field.key),
        header: field.label,
        accessorFn: (row: T) => row.customFields?.[field.key] ?? null,
        enableSorting: false,
        size: 160,
        cell: ({ row }) => {
            const text = formatCustomFieldValue(field.type ?? field.fieldType, row.original.customFields?.[field.key]);
            return text === null ? <span className="text-muted-foreground">—</span> : <span className="block max-w-48 truncate">{text}</span>;
        },
    }));
}

export function customFieldColumnsHidden(fields: CustomFieldDefinition[]) {
    return Object.fromEntries(fields.map((field) => [customFieldColumnId(field.key), false]));
}

// Custom fields as filter drawer fields (filtered on the server as `customFields.<key>`).
export function customFieldFilterFields(fields: CustomFieldDefinition[]) {
    return fields.map((field) => {
        const kind = formFieldType(field.type ?? field.fieldType);
        const key = `customFields.${field.key}`;
        if (kind === "DROPDOWN") return { label: field.label, key, type: "select" as const, options: (field.options ?? []).map((option) => ({ label: option, value: option })) };
        if (kind === "NUMBER") return { label: field.label, key, type: "number" as const };
        if (kind === "DATE" || kind === "DATETIME") return { label: field.label, key, type: "date" as const };
        if (kind === "BOOLEAN") return { label: field.label, key, type: "boolean" as const };
        return { label: field.label, key, type: "text" as const };
    });
}
