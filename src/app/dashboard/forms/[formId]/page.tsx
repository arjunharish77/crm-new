"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { FormEditor } from "@/components/forms/form-editor";
import { SubmissionsTable } from "@/components/forms/submissions-table";
import { AnalyticsDashboard } from "@/components/forms/form-analytics";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function FormBuilderPage() {
    const params = useParams();
    const formId = params.formId as string;
    const [form, setForm] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (formId) {
            apiFetch(`/forms/${formId}`)
                .then(setForm)
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [formId]);

    if (loading) return <div className="p-8">Loading form builder...</div>;
    if (!form) return <div className="p-8">Form not found</div>;

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
            <div className="flex items-center gap-4 px-6 py-4 border-b bg-background">
                <Link href="/dashboard/forms">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div className="flex-1">
                    <h1 className="text-lg font-semibold">{form.name}</h1>
                    <div className="text-xs text-muted-foreground flex gap-2 items-center">
                        <span className={`inline-block w-2 h-2 rounded-full ${form.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <span>{form.isActive ? 'Active' : 'Draft'}</span>
                        <span>•</span>
                        <a href={`/public-form/${form.id}`} target="_blank" className="text-primary hover:underline flex items-center gap-1" rel="noreferrer">
                            View Public Page <ExternalLink className="h-3 w-3" />
                        </a>
                    </div>
                </div>
            </div>

            <Tabs defaultValue="editor" className="flex-1 flex flex-col overflow-hidden">
                <div className="px-6 border-b bg-muted/10">
                    <TabsList className="bg-transparent h-12">
                        <TabsTrigger value="editor" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Builder</TabsTrigger>
                        <TabsTrigger value="submissions" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Submissions</TabsTrigger>
                        <TabsTrigger value="analytics" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Analytics</TabsTrigger>
                    </TabsList>
                </div>

                <div className="flex-1 overflow-hidden bg-background">
                    <TabsContent value="editor" className="h-full m-0 p-0 border-none outline-none data-[state=inactive]:hidden">
                        <FormEditor initialForm={form} />
                    </TabsContent>

                    <TabsContent value="submissions" className="h-full m-0 p-6 overflow-y-auto data-[state=inactive]:hidden">
                        <div className="max-w-6xl mx-auto">
                            <SubmissionsTable formId={formId} />
                        </div>
                    </TabsContent>

                    <TabsContent value="analytics" className="h-full m-0 p-6 overflow-y-auto data-[state=inactive]:hidden">
                        <div className="max-w-6xl mx-auto">
                            <AnalyticsDashboard formId={formId} />
                        </div>
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
