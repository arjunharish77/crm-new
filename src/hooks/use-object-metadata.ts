'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

export function useObjectMetadata(objectName: string) {
    const [metadata, setMetadata] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        async function fetchMetadata() {
            setLoading(true);
            try {
                // Assuming we have an endpoint for this, or using the existing custom-fields one if updated
                const data = await apiFetch(`/metadata/objects/${objectName.toLowerCase()}`);
                if (isMounted) {
                    setMetadata(data);
                }
            } catch (error) {
                console.error(`Failed to fetch metadata for ${objectName}`, error);
                toast.error(`Failed to load metadata for ${objectName}`);
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        }

        if (objectName) {
            fetchMetadata();
        }
        return () => { isMounted = false; };
    }, [objectName]);

    return { metadata, loading };
}
