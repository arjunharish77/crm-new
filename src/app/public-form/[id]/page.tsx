"use client";
import { useParams } from "next/navigation";
import { PublicFormPageContent } from "@/components/forms/public-form-page";
export default function PublicFormPage() {
    const params = useParams<{ id: string }>();
    return <PublicFormPageContent identifier={params.id} />;
}
