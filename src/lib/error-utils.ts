/**
 * Converts technical API errors into user-friendly messages
 */

export interface ApiError {
    message: string;
    status?: number;
    statusText?: string;
}

/**
 * Maps HTTP status codes and error messages to user-friendly text
 */
export function getUserFriendlyError(error: ApiError | Error | any): string {
    // If error is a string, return it
    if (typeof error === 'string') {
        return error;
    }

    let message = error?.message || '';

    // Handle array of messages (e.g., from NestJS validation)
    if (Array.isArray(message)) {
        message = message.join(', ');
    }

    // Ensure message is a string before proceeding
    if (typeof message !== 'string') {
        message = String(message);
    }

    const status = error?.status;

    // Check for specific error patterns in message
    if (message.includes('already exists') || message.includes('duplicate') || message.includes('Unique constraint')) {
        return 'This item already exists. Please use a different value.';
    }

    if (message.includes('not found') || message.includes('does not exist')) {
        return 'The requested item could not be found.';
    }

    if (message.includes('unauthorized') || message.toLowerCase().includes('jwt') || message.includes('token')) {
        return 'Your session has expired. Please log in again.';
    }

    if (message.includes('forbidden') || message.includes('permission')) {
        return "You don't have permission to perform this action.";
    }

    if (message.includes('validation') || message.includes('invalid input')) {
        return 'Please check your input and try again.';
    }

    // Check HTTP status codes
    switch (status) {
        case 400:
            return 'Please check your input and try again.';
        case 401:
            return 'Your session has expired. Please log in again.';
        case 403:
            return "You don't have permission to perform this action.";
        case 404:
            return 'The requested item could not be found.';
        case 409:
            return 'This item already exists. Please use a different value.';
        case 422:
            return 'The data you provided is invalid. Please check and try again.';
        case 429:
            return 'Too many requests. Please wait a moment and try again.';
        case 500:
        case 502:
        case 503:
        case 504:
            return 'Something went wrong on our end. Please try again later.';
        default:
            break;
    }

    // If message seems user-friendly already (no technical jargon), return it
    if (message && !message.includes('Error:') && !message.includes('Exception') && message.length < 100) {
        return message;
    }

    // Fallback
    return 'An unexpected error occurred. Please try again.';
}

/**
 * Formats error message for form field validation
 */
export function getFieldError(error: any, fieldName: string): string {
    if (error?.errors?.[fieldName]) {
        return error.errors[fieldName];
    }
    return `Invalid ${fieldName}`;
}
