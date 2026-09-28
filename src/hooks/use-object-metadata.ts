'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

export function useObjectMetadata(objectName: string) {
    const [metadata, setMetadata] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const retry = useCallback(() => setAttempt(value => value + 1), []);

    useEffect(() => {
        const controller = new AbortController();
        setMetadata(null);
        setError(false);
        let isMounted = true;

        if (!objectName) {
            setMetadata(null);
            setLoading(false);
            return () => { isMounted = false; };
        }

        async function fetchMetadata() {
            setLoading(true);
            try {
                // Assuming we have an endpoint for this, or using the existing custom-fields one if updated
                const data = await apiFetch(`/metadata/objects/${objectName.toLowerCase()}`, { signal: controller.signal });
                if (isMounted) {
                    setMetadata(data);
                }
            } catch (error) {
                if (isMounted && !controller.signal.aborted) setError(true);
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        }
        fetchMetadata();
        return () => { isMounted = false; controller.abort(); };
    }, [objectName, attempt]);

    return { metadata, loading, error, retry };
}
