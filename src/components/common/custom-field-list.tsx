"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { fetchCached } from "@/lib/views-metadata-cache";
import { formatCustomFieldValue } from "@/components/common/custom-field-columns";
import { DescriptionList } from "@/components/common/section";

type FieldDefinition = { id: string; key: string; label: string; type?: string; fieldType?: string; entityTypeId?: string | null; isActive?: boolean; order?: number };

// A record's custom fields on its Details tab: every field defined for the record type (and the
// record's own opportunity type), with "—" where the record has no value.
export function CustomFieldList({ objectType, typeId, values, className }: {
    objectType: "LEAD" | "OPPORTUNITY";
    typeId?: string | null;
    values: Record<string, unknown> | null | undefined;
    className?: string;
}) {
    const [fields, setFields] = useState<FieldDefinition[]>([]);
    useEffect(() => {
        let active = true;
        fetchCached(`custom-fields:${objectType}`, () => apiFetch<FieldDefinition[]>(`/custom-fields?objectType=${objectType}`))
            .then((rows) => { if (active) setFields(Array.isArray(rows) ? rows : []); })
            .catch(() => { if (active) setFields([]); });
        return () => { active = false; };
    }, [objectType]);

    const shown = fields
        .filter((field) => field.isActive !== false && (!field.entityTypeId || field.entityTypeId === typeId))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (!shown.length) return null;
    return (
        <div className={className}>
            <h3 className="mt-4 text-sm font-medium">Custom fields</h3>
            <DescriptionList items={shown.map((field) => ({ label: field.label, value: formatCustomFieldValue(field.type ?? field.fieldType, values?.[field.key]) }))} />
        </div>
    );
}

