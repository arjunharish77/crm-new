'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { CustomFieldDefinition } from '@/types/custom-fields';
import { toast } from 'sonner';

export function useFormSchema(objectType: 'LEAD' | 'OPPORTUNITY' | 'ACTIVITY') {
    const [schema, setSchema] = useState<CustomFieldDefinition[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        async function fetchSchema() {
            setLoading(true);
            try {
                const data = await apiFetch(`/custom-fields?objectType=${objectType}`);
                if (isMounted) {
                    setSchema(data);
                }
            } catch (error) {
                console.error(`Failed to fetch schema for ${objectType}`, error);
                toast.error(`Failed to load form fields for ${objectType}`);
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        }

        fetchSchema();
        return () => { isMounted = false; };
    }, [objectType]);

    return { schema, loading };
}
