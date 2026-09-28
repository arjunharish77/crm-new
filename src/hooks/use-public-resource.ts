"use client";

import { useCallback, useEffect, useState } from "react";

/** Public links distinguish missing resources from recoverable request failures. */
export function usePublicResource<T>(url: string) {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<number | null>(null);
    const [attempt, setAttempt] = useState(0);
    const retry = useCallback(() => setAttempt((value) => value + 1), []);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true); setStatus(null); setData(null);
        fetch(url, { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw Object.assign(new Error("Public resource unavailable"), { status: response.status });
                return response.json() as Promise<T>;
            })
            .then((value) => { if (!controller.signal.aborted) setData(value); })
            .catch((error) => { if (!controller.signal.aborted) setStatus(error.status || 0); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [url, attempt]);
    return { data, loading, error: status !== null, notFound: status === 404 || status === 410, retry };
}
