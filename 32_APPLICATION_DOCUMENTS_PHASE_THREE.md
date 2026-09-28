# Module 12 — Private document uploads and reviews

Implemented 15 September 2026 in `crm`, port 3000. Extends [phase two](31_APPLICATION_WORKFLOW_PHASE_TWO.md).

## User workflow

Application details → Document checklist now provides:

- **Upload document / Upload replacement** for internal users with Applications read and update permission.
- **Download** for readers who can access the application. Account status, tenant, module and application visibility are checked again on each download.
- **Review document** for readers with Applications manage permission. Reviews record verified/rejected status, rejection reason, comments, optional expiry date and reviewer. Rejection requires a reason.

Uploads accept nonempty PDF, PNG or JPEG content up to 5 MB. Server checks file signatures rather than trusting the browser MIME type. This is a type-signature check, not validation of the complete file format or its safety. Filenames cannot contain path separators or control characters. Files use server-generated storage keys in private local storage, never public asset paths.

The raw upload stream is bounded at 5 MB, including requests without Content-Length. The application and active checklist requirement must belong to the current tenant/program and be accessible before the upload is attached. A UUID upload request key deduplicates retries; reusing the key with different bytes, filename or requirement receives 409.

A replacement creates a new pending document and preserves the previous record/file. The latest document determines checklist readiness. Older versions remain stored, but a version-history browser is not included in this phase. Legacy documents without a FileObject link cannot be downloaded or reviewed through these controls; upload a replacement to establish a managed file link.

Reviews use an integer version to reject stale or competing decisions. Only the latest replacement can be reviewed. Uploads, reviews and stage changes lock the same Application row, preventing a document change from racing a stage-readiness check. A replacement after a prior stage transition changes current readiness; it does not automatically move the application backward.

Downloads are returned as attachments with `application/octet-stream`, `nosniff`, a restrictive CSP and private/no-store caching. Storage paths are never returned in checklist metadata. Download failures appear inline.

The upload/review dialogs preserve drafts (including the selected File in authenticated memory) across navigation, retain failure feedback, protect dirty dismissal and block controls during saves. Refresh/sign-out clears these drafts. A stale-review error offers **Discard and reload status**. No file contents are persisted to browser local storage.

## Storage and migration

Apply `migrations/0112_application_document_files.sql` before deployment. It adds FileObject/uploader links, upload retry keys and review versions. Applied locally in this session only.

FileObject, ApplicationDocument and the upload audit entry commit together. If persistence fails, an unlinked file is removed when the database can confirm it is unlinked. After an ambiguous database failure, an unconfirmed file is retained for reconciliation rather than risking deletion of a committed document. A scheduled orphan-reconciliation job remains future work.

**Malware scanning is not configured.** The shared scan hook remains a placeholder; the UI states this, and these uploads are not described as malware-scanned. A real scanner/quarantine policy is still needed. The existing S3 driver is also a placeholder; this phase was tested with private local storage. No external scanner or storage service was installed or configured.

## Verification

- 36 unit tests passed across document input, numbering and stage-transition schemas/permissions. Includes unsafe filenames, supported signatures, empty/oversized/unsupported content, rejection reasons and invalid calendar dates.
- 64 local database/HTTP assertions passed in `scripts/application-document-smoke.ts`: phase-one/two regressions, concurrent upload deduplication, byte-for-byte private download, foreign-tenant denial, review permission denial, competing review versions, replacement readiness, superseded review denial, comments and storage-path omission. The optional HTTP run adds real admin login, raw binary upload/retry, download bytes/headers, review, unauthenticated denial and oversized upload rejection.
- 20 fixture-browser checks passed in `scripts/ui-application-document-smoke.cjs`: 320px/1280px, light/dark, 32px root text, upload and review failures/retries, dirty dismissal, declined discard, pending review lock and download filename.
- Evidence: `ui-audit-2026-09/module-12-phase-three`. Temporary application/catalog/document/audit/FileObject records and private test files were cleaned. No customer messages were sent.
- TypeScript, targeted ESLint and whitespace checks passed. Final build status is recorded in the implementation progress document.

The local dev server needed a restart after retaining stale repository exports; the subsequent real HTTP tests passed. It remains on port 3000.

## Remaining

Automated document reminders are still needed, so the full document-workflow checklist item remains open. Also pending: dedicated upload/review permission modules, real malware scanning/quarantine, external storage integration, version-history UI, retention/deletion policy, orphan reconciliation, and broader live non-admin browser acceptance. Stage payment/task/approval gates and operational SLA processing remain separate phases.
