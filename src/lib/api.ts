import { loginPathFromHere } from './safe-return-path';
import { toast } from "sonner";

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
        timestamp: new Date().toISOString()
    });

    // F06 fix (WP05): session auth is now an HttpOnly cookie -- there is no token for this code
    // to read anymore, and none is needed: the browser attaches the cookie automatically to
    // this same-origin request, exactly like it already does for a plain <form> submission.
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
        if (externalSignal.aborted) controller.abort();
        else externalSignal.addEventListener('abort', onExternalAbort);
    }

    // F22 fix (WP12): declared outside the try block, and always cleared in the `finally` below
    // -- previously `clearTimeout` only ran on the SUCCESS path (right after a resolved fetch),
    // so any rejection (a real network failure, or the caller's own cancellation via
    // `externalSignal`) left this 30s timer running uncleared. Harmless when the timeout itself
    // was what caused the rejection (the timer already fired), but a genuine leak for every
    // OTHER failure -- it fires 30s later and calls `controller.abort()` on an already-settled
    // controller, which does nothing useful but still costs a live timer for that whole window.
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
        // Add 30-second timeout
        timeoutId = setTimeout(() => {
            timedOut = true;
            debugLog('error', `[API ${requestId}] TIMEOUT after 30s for: ${endpoint}`);
            controller.abort();
        }, 30000);

        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers,
            signal: controller.signal,
        });

        const elapsed = Date.now() - startTime;
        debugLog('log', `[API ${requestId}] Response received in ${elapsed}ms:`, {
            status: response.status,
            ok: response.ok,
            endpoint
        });

        if (!response.ok) {
            // Handle 401 Unauthorized globally. The session cookie is HttpOnly now (F06 fix,
            // WP05) so this can't clear it client-side -- an already-invalid/expired cookie is
            // harmless left in place; it keeps failing auth until overwritten by a fresh login
            // or it naturally expires.
            if (response.status === 401 && typeof window !== 'undefined') {
                // Avoid redirect loop if already on login
                if (!window.location.pathname.includes('/login')) {
                    window.location.href = loginPathFromHere({ expired: 'true' });
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
                ["DUPLICATE_RULE_BLOCK", "MODULE_DEPENDENCY", "MODULE_DISABLED", "USAGE_LIMIT_REACHED"].includes(errorData.code) ? errorMessage : getUserFriendlyError({
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
            keys: data !== null && typeof data === 'object' ? Object.keys(data).slice(0, 5) : 'N/A'
        });

        if (options.method && !["GET", "HEAD"].includes(options.method.toUpperCase()) && Array.isArray(data?.duplicateWarnings)) {
            for (const warning of data.duplicateWarnings) toast.warning(`Saved with a duplicate match: ${warning.name}`);
        }
        return data;
    } catch (error: any) {
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
    } finally {
        clearTimeout(timeoutId);
        externalSignal?.removeEventListener('abort', onExternalAbort);
    }
}
