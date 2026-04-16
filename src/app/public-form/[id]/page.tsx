'use client';

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { PublicFormRenderer } from "@/components/forms/public-form-renderer";
import { Card } from "@/components/ui/card";

export default function PublicFormByIdPage() {
    const params = useParams();
    const formId = params.id as string;
    const [form, setForm] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (formId) {
            apiFetch(`/public/forms/${formId}`)
                .then(setForm)
                .catch(() => setError("Form not found or unavailable"))
                .finally(() => setLoading(false));
        }
    }, [formId]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-pulse">Loading form...</div>
            </div>
        );
    }

    if (error || !form) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Card className="p-8 max-w-md w-full text-center">
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Unavailable</h1>
                    <p className="text-muted-foreground">{error || "This form is no longer accepting responses."}</p>
                </Card>
            </div>
        );
    }

    if (!form.isActive) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Card className="p-8 max-w-md w-full text-center">
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Form Closed</h1>
                    <p className="text-muted-foreground">This form is currently inactive.</p>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
            <Card className="max-w-xl w-full p-8 shadow-lg">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">{form.name}</h1>
                    {form.description && (
                        <p className="mt-2 text-gray-600">{form.description}</p>
                    )}
                </div>

                <PublicFormRenderer slug={formId} config={form.config} />

                <div className="mt-8 pt-6 border-t text-center">
                    <p className="text-xs text-muted-foreground">Powered by Enterprise CRM</p>
                </div>
            </Card>
        </div>
    );
}
