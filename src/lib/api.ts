
import Cookies from 'js-cookie';
import { getUserFriendlyError } from './error-utils';

const API_URL = '/api';
const API_DEBUG = process.env.NEXT_PUBLIC_API_DEBUG === 'true';

function debugLog(method: 'log' | 'warn' | 'error', ...args: unknown[]) {
    if (API_DEBUG) console[method](...args);
}

function createNetworkError(endpoint: string) {
    const error: any = new Error('Could not reach the app server. Please refresh once the server is ready.');
    error.status = 0;
    error.originalMessage = `Network request failed for ${endpoint}`;
    return error;
}

export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = Cookies.get('token');
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();
    // Gap checklist Module 10's "performance UX polish" item, "request cancellation on
    // tab/filter changes" -- previously `options.signal` was silently clobbered below (spread
    // before the internal timeout controller's own `signal`), so a caller had NO way to cancel
    // an in-flight request at all. `timedOut` distinguishes OUR OWN 30s timeout abort from the
    // caller's own cancellation in the catch block below, so a deliberate cancellation (e.g. the
    // user changed filters) never surfaces as a misleading "Request timed out" error.
    const externalSignal = options.signal;
    let timedOut = false;

    debugLog('log', `[API ${requestId}] Starting fetch to: ${endpoint}`, {
        method: options.method || 'GET',
        hasToken: !!token,
        timestamp: new Date().toISOString()
    });

    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers,
    };

    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
        if (externalSignal.aborted) controller.abort();
        else externalSignal.addEventListener('abort', onExternalAbort);
    }

    try {
        // Add 30-second timeout
        const timeoutId = setTimeout(() => {
            timedOut = true;
            debugLog('error', `[API ${requestId}] TIMEOUT after 30s for: ${endpoint}`);
            controller.abort();
        }, 30000);

        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        externalSignal?.removeEventListener('abort', onExternalAbort);
        const elapsed = Date.now() - startTime;
        debugLog('log', `[API ${requestId}] Response received in ${elapsed}ms:`, {
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

            debugLog('error', `[API ${requestId}] Error ${response.status} for ${endpoint}: ${errorMessage}`, {
                status: response.status,
                message: errorMessage,
                // Log full structured body from global exception filter
                body: errorData,
            });

            // Special handling for 403
            if (response.status === 403) {
                debugLog('warn', `[API ${requestId}] Permission denied:`, errorData?.message || errorMessage);
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
            error.body = errorData;

            throw error;
        }

        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await response.json()
            : await response.text();
        debugLog('log', `[API ${requestId}] Data parsed successfully:`, {
            isArray: Array.isArray(data),
            keys: typeof data === 'object' ? Object.keys(data).slice(0, 5) : 'N/A'
        });

        return data;
    } catch (error: any) {
        externalSignal?.removeEventListener('abort', onExternalAbort);
        const elapsed = Date.now() - startTime;
        const isAbort = error.name === 'AbortError';
        const isTimeout = isAbort && timedOut;
        const isExternalCancel = isAbort && !timedOut && !!externalSignal?.aborted;
        debugLog('error', `[API ${requestId}] ${isTimeout ? 'TIMEOUT' : isExternalCancel ? 'CANCELLED' : 'Fetch failed'} after ${elapsed}ms:`, {
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
        // A caller-initiated cancellation (e.g. the user changed filters/tabs before this
        // request resolved) is expected, not a failure -- rethrown as-is (still a real
        // AbortError) so callers can recognize and silently ignore it, matching the standard
        // `if (error.name !== "AbortError") ...` convention rather than getting a misleading
        // "Request timed out" or generic network-error message for something they caused on
        // purpose.
        if (isExternalCancel) throw error;
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
            throw createNetworkError(endpoint);
        }
        throw error;
    }
}
