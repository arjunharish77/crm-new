# CRM

This folder is the new standalone Next.js app intended for direct Vercel deployment.

## Goal

Replace the legacy multi-service stack with:

- Next.js app router
- Supabase as the backend
- no Nest API
- no worker
- no Redis
- no Elasticsearch

## Current Status

The app shell and UI have been copied from the legacy frontend so migration can happen incrementally.

Supabase-first plumbing has been added in:

- `src/lib/supabase/client.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/middleware.ts`
- `middleware.ts`

Feature parity is still in progress. Many screens still reference the old API contract and need to be ported to server actions, route handlers, or direct Supabase-backed data access.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Local Development

```bash
npm install
npm run dev
```
