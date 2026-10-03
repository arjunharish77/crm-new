'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Copy, ExternalLink, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { FormEditor } from '@/components/forms/form-editor';
import { SubmissionsTable } from '@/components/forms/submissions-table';
import { AnalyticsDashboard } from '@/components/forms/form-analytics';
import { CrmPlacementEditor } from '@/components/forms/crm-placement-editor';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/page-header';
import { PageTabs, usePageTab, type PageTab } from '@/components/common/page-tabs';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { publicFormPath, publicFormUrl } from '@/lib/forms/public-url';
import { purgeDate } from '@/hooks/use-archive-actions';
import { useRecordTitle } from "@/components/app-states/page-title";

const TABS = [
    { value: 'editor', label: 'Builder' },
    { value: 'submissions', label: 'Submissions' },
    { value: 'analytics', label: 'Analytics' },
    { value: 'placement', label: 'CRM placement' },
] as const;
type BuilderTab = (typeof TABS)[number]['value'];

// Marketing & automation › Forms › one form (UI/UX plan §5.13): status shown once, one public
// link (/f/{slug}) with a copy button, and a load failure that says so instead of "not found".
export default function FormBuilderPage() {
    const params = useParams();
    const formId = params.formId as string;
    const [form, setForm] = useState<any>(null);
    useRecordTitle(form?.name);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<'missing' | 'failed' | null>(null);
    const [activeTab, setActiveTab] = usePageTab<BuilderTab>(TABS as unknown as PageTab<BuilderTab>[], 'editor');

    const load = useCallback(() => {
        if (!formId) return;
        setLoading(true);
        setLoadError(null);
        apiFetch(`/forms/${formId}`)
            .then((data: any) => { if (data) setForm(data); else setLoadError('missing'); })
            .catch((error: any) => setLoadError(error?.status === 404 ? 'missing' : 'failed'))
            .finally(() => setLoading(false));
    }, [formId]);
    useEffect(() => { load(); }, [load]);

    const restoreArchived = async () => {
        try {
            const restored = await apiFetch(`/forms/${formId}/restore`, { method: 'POST' });
            setForm(restored);
            toast.success('Form restored');
        } catch (error: any) {
            toast.error(error?.message || "The form couldn't be restored");
        }
    };

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(publicFormUrl(form.slug));
            toast.success('Public link copied');
        } catch {
            toast.error("The link couldn't be copied");
        }
    };

    if (loading && !form) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="size-8 animate-spin text-primary" aria-label="Loading the form" />
            </div>
        );
    }

    if (!form) {
        return (
            <div className="mx-auto max-w-[1700px]">
                <PageHeader title={loadError === 'missing' ? 'Form not found' : 'Form'} backHref="/dashboard/forms" backLabel="Forms" />
                {loadError === 'missing'
                    ? <EmptyState kind="no-match" title="This form doesn't exist" description="It may have been deleted." action={<Button variant="outline" asChild><Link href="/dashboard/forms">Back to forms</Link></Button>} />
                    : <ErrorState description="The form couldn't be loaded." onRetry={load} />}
            </div>
        );
    }

    return (
        <div className="mx-auto min-w-0 max-w-[1700px]">
            <PageHeader
                title={form.name}
                backHref="/dashboard/forms"
                backLabel="Forms"
                meta={
                    <span className="flex flex-wrap items-center gap-2">
                        <Badge tone={form.deletedAt ? 'warning' : !form.publishedVersion ? 'info' : form.isActive ? 'success' : 'neutral'}>{form.deletedAt ? 'Archived' : !form.publishedVersion ? 'Draft · not published' : form.isActive ? 'Live' : 'Off'}</Badge>
                        <span className="break-all text-muted-foreground">{publicFormPath(form.slug)}</span>
                    </span>
                }
                secondaryActions={
                    <>
                        <Button variant="outline" onClick={copyLink}><Copy className="size-4" />Copy public link</Button>
                        <Button variant="outline" asChild>
                            <a href={publicFormPath(form.slug)} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />Open public form</a>
                        </Button>
                    </>
                }
            />
            {form.deletedAt ? (
                <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-status-warning px-3 py-2 text-sm text-status-warning-foreground">
                    <span>This form is archived: its public link doesn&apos;t work and it can&apos;t be changed. It will be deleted with its submissions on {purgeDate(form.deletedAt)}.</span>
                    <Button size="sm" variant="outline" onClick={restoreArchived}>Restore</Button>
                </div>
            ) : null}
            <PageTabs label="Form" tabs={TABS as unknown as PageTab<BuilderTab>[]} value={activeTab} onChange={setActiveTab} className="mb-3" />
            <div className="rounded-xl border bg-background">
                {/* The builder and placement panels stay mounted while hidden, so switching tabs
                    never discards unsaved work (UI/UX plan B5). Both share `form` as the latest
                    saved version. */}
                <div hidden={activeTab !== 'editor'} className="min-h-[calc(100vh-240px)]">
                    <FormEditor initialForm={form} onSaved={setForm} />
                </div>
                {activeTab === 'submissions' ? <div className="p-3 md:p-4"><SubmissionsTable formId={formId} /></div> : null}
                {activeTab === 'analytics' ? <div className="p-3 md:p-4"><AnalyticsDashboard formId={formId} /></div> : null}
                <div hidden={activeTab !== 'placement'}>
                    <CrmPlacementEditor initialForm={form} onSaved={setForm} />
                </div>
            </div>
        </div>
    );
}
