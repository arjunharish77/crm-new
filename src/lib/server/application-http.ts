import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApplicationError } from '@/lib/repositories/applications-postgres';
import { forbidden, unauthorized, serverError } from '@/lib/server/http';
export function applicationHttpError(error: unknown) {
    if (error instanceof ZodError) return NextResponse.json({ message: error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ') }, { status: 400 });
    if (error instanceof ApplicationError) return NextResponse.json({ message: error.message }, { status: error.status });
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return unauthorized();
    if (error instanceof Error && error.message === 'FORBIDDEN') return forbidden();
    if (error instanceof Error && error.message.startsWith('MODULE_DISABLED')) return forbidden('Product Catalog and Applications is disabled for this workspace.');
    return serverError('Application request failed', error);
}
