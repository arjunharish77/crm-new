
import Cookies from 'js-cookie';
import { getUserFriendlyError } from './error-utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = Cookies.get('token');
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();

    console.log(`[API ${requestId}] Starting fetch to: ${endpoint}`, {
        method: options.method || 'GET',
        hasToken: !!token,
        timestamp: new Date().toISOString()
    });

    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers,
    };

    try {
        // Add 30-second timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            console.error(`[API ${requestId}] TIMEOUT after 30s for: ${endpoint}`);
            controller.abort();
        }, 30000);

        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const elapsed = Date.now() - startTime;
        console.log(`[API ${requestId}] Response received in ${elapsed}ms:`, {
            status: response.status,
            ok: response.ok,
            endpoint
        });

        if (!response.ok) {
            // Handle 401 Unauthorized globally
            if (response.status === 401 && typeof window !== 'undefined') {
                Cookies.remove('token');
                // Avoid redirect loop if already on login
                if (!window.location.pathname.includes('/login')) {
                    window.location.href = '/login?expired=true';
                }
            }

            // Parse error response
            let errorMessage = '';
            let errorData: any = {};

            try {
                const contentType = response.headers.get('content-type');
                if (contentType?.includes('application/json')) {
                    errorData = await response.json();
                    const rawMessage = errorData.message || errorData.error || response.statusText;
                    errorMessage = Array.isArray(rawMessage) ? rawMessage.join(', ') : rawMessage;
                } else {
                    errorMessage = await response.text();
                }
                if (!errorMessage) errorMessage = response.statusText;
            } catch (e) {
                errorMessage = response.statusText;
            }

            console.error(`[API ${requestId}] Error response:`, {
                status: response.status,
                message: errorMessage,
                // Log full structured body from global exception filter
                body: errorData,
            });

            // Special handling for 403
            if (response.status === 403) {
                console.warn(`[API ${requestId}] Permission denied:`, errorData?.message || errorMessage);
            }

            // Create error with user-friendly message
            const error: any = new Error(
                getUserFriendlyError({
                    message: errorMessage,
                    status: response.status,
                    statusText: response.statusText,
                })
            );
            error.status = response.status;
            error.statusText = response.statusText;
            error.originalMessage = errorMessage;

            throw error;
        }

        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await response.json()
            : await response.text();
        console.log(`[API ${requestId}] Data parsed successfully:`, {
            isArray: Array.isArray(data),
            keys: typeof data === 'object' ? Object.keys(data).slice(0, 5) : 'N/A'
        });

        return data;
    } catch (error: any) {
        const elapsed = Date.now() - startTime;
        const isTimeout = error.name === 'AbortError';
        console.error(`[API ${requestId}] ${isTimeout ? 'TIMEOUT' : 'Fetch failed'} after ${elapsed}ms:`, {
            name: error.name,
            message: error.message,
            status: error.status,
            endpoint,
        });
        if (isTimeout) {
            const timeoutError: any = new Error('Request timed out. Please try again.');
            timeoutError.status = 408;
            throw timeoutError;
        }
        throw error;
    }
}
