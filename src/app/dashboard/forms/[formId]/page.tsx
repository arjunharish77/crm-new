'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft as ArrowBackIcon, ExternalLink as OpenInNewIcon, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { FormEditor } from '@/components/forms/form-editor';
import { SubmissionsTable } from '@/components/forms/submissions-table';
import { AnalyticsDashboard } from '@/components/forms/form-analytics';
import { CrmPlacementEditor } from '@/components/forms/crm-placement-editor';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type BuilderTab = 'editor' | 'submissions' | 'analytics' | 'placement';

export default function FormBuilderPage() {
    const params = useParams();
    const router = useRouter();
    const formId = params.formId as string;
    const [form, setForm] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<BuilderTab>('editor');

    useEffect(() => {
        if (!formId) return;

        apiFetch(`/forms/${formId}`)
            .then(setForm)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [formId]);

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="size-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!form) {
        return (
            <div className="p-6">
                <h1 className="mb-1 text-lg font-bold">Form not found</h1>
                <Button onClick={() => router.push('/dashboard/forms')} variant="outline">
                    Back to Forms
                </Button>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[1700px] px-3 py-3 md:px-4 md:py-4">
            <div className="flex flex-col gap-4">
                <div>
                    <Button
                        variant="ghost"
                        onClick={() => router.push('/dashboard/forms')}
                        className="mb-2 h-[34px] text-muted-foreground"
                    >
                        <ArrowBackIcon className="size-4" />
                        Back
                    </Button>
                    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                        <div>
                            <h1 className="text-lg font-extrabold tracking-tight">
                                {form.name}
                            </h1>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2">
                                <span className="text-sm text-muted-foreground">
                                    {form.isActive ? 'Active' : 'Draft'}
                                </span>
                                <span className="text-sm text-muted-foreground">&bull;</span>
                                <Link
                                    href={`/public-form/${form.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary no-underline hover:underline"
                                >
                                    View Public Page
                                    <OpenInNewIcon className="size-4" />
                                </Link>
                            </div>
                        </div>
                        <Badge variant={form.isActive ? "default" : "outline"} className="rounded-md font-bold">
                            {form.isActive ? 'Live Form' : 'Draft Form'}
                        </Badge>
                    </div>
                </div>

                <Card className="gap-0 overflow-hidden rounded-2xl py-0">
                    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as BuilderTab)}>
                        <div className="border-b bg-muted/30 px-2 py-2">
                            <TabsList className="h-auto bg-transparent p-0 gap-1">
                                <TabsTrigger value="editor" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">Builder</TabsTrigger>
                                <TabsTrigger value="submissions" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">Submissions</TabsTrigger>
                                <TabsTrigger value="analytics" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">Analytics</TabsTrigger>
                                <TabsTrigger value="placement" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">CRM Placement</TabsTrigger>
                            </TabsList>
                        </div>

                        <div className="bg-background">
                            <TabsContent value="editor" className="mt-0 min-h-[calc(100vh-240px)]">
                                <FormEditor initialForm={form} />
                            </TabsContent>

                            <TabsContent value="submissions" className="mt-0 p-3 md:p-4">
                                <SubmissionsTable formId={formId} />
                            </TabsContent>

                            <TabsContent value="analytics" className="mt-0 p-3 md:p-4">
                                <AnalyticsDashboard formId={formId} />
                            </TabsContent>

                            <TabsContent value="placement" className="mt-0">
                                <CrmPlacementEditor initialForm={form} onSaved={setForm} />
                            </TabsContent>
                        </div>
                    </Tabs>
                </Card>
            </div>
        </div>
    );
}
