"use client";

// Priority Module 12's "product catalog" item 4, "admin catalog management UI for universities,
// campuses, programs, courses, intakes, fees, scholarships, eligibility criteria, application
// stages, and document checklists." A 3-level drill-down (University -> Campuses/Programs ->
// Program's own Courses/Intakes/FeePlans/Scholarships/Eligibility/Stages/Checklists), mirroring
// the real hierarchy the schema itself encodes (migrations 0100/0101). `ProductCatalog` and
// `Specialization` are deliberately NOT managed here -- neither is named in this checklist
// item's own wording (see `catalog-postgres.ts`'s own comment on why `ProductCatalog` is
// auto-managed per tenant instead of a user-facing concept).
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CatalogEntityManager } from "@/components/catalog/catalog-entity-manager";

const PROGRAM_LEVEL_OPTIONS = [
    { value: "CERTIFICATE", label: "Certificate" },
    { value: "DIPLOMA", label: "Diploma" },
    { value: "UNDERGRADUATE", label: "Undergraduate" },
    { value: "POSTGRADUATE", label: "Postgraduate" },
    { value: "DOCTORATE", label: "Doctorate" },
];

const DISCOUNT_TYPE_OPTIONS = [
    { value: "PERCENTAGE", label: "Percentage" },
    { value: "FIXED_AMOUNT", label: "Fixed Amount" },
];

export default function CatalogSettingsPage() {
    const [selectedUniversity, setSelectedUniversity] = useState<any | null>(null);
    const [selectedProgram, setSelectedProgram] = useState<any | null>(null);

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-xl font-bold">Product Catalog</h1>
                <p className="text-sm text-muted-foreground">
                    Manage universities, campuses, programs, courses, intakes, fees, scholarships, eligibility criteria, application stages, and document checklists.
                </p>
            </div>

            <Card className="rounded-2xl p-4">
                <CatalogEntityManager
                    entityKey="universities"
                    requiresParent={false}
                    title="Universities"
                    emptyDescription="Add your first university to start building out your catalog."
                    selectedId={selectedUniversity?.id ?? null}
                    onSelectItem={(item) => {
                        setSelectedUniversity((current: any) => (current?.id === item.id ? null : item));
                        setSelectedProgram(null);
                    }}
                    fields={[
                        { key: "name", label: "Name", type: "text" },
                        { key: "code", label: "Code", type: "text" },
                        { key: "country", label: "Country", type: "text" },
                        { key: "city", label: "City", type: "text" },
                        { key: "website", label: "Website", type: "text" },
                        { key: "isActive", label: "Active", type: "boolean", defaultValue: true },
                    ]}
                />
            </Card>

            {selectedUniversity ? (
                <Card className="rounded-2xl p-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground/60">
                        {selectedUniversity.name}
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                        <CatalogEntityManager
                            entityKey="campuses"
                            parentId={selectedUniversity.id}
                            title="Campuses"
                            emptyDescription="Add a campus for this university."
                            fields={[
                                { key: "name", label: "Name", type: "text" },
                                { key: "addressLine", label: "Address", type: "text" },
                                { key: "city", label: "City", type: "text" },
                                { key: "state", label: "State", type: "text" },
                                { key: "country", label: "Country", type: "text" },
                                { key: "isActive", label: "Active", type: "boolean", defaultValue: true },
                            ]}
                        />
                        <CatalogEntityManager
                            entityKey="programs"
                            parentId={selectedUniversity.id}
                            title="Programs"
                            emptyDescription="Add a program (e.g. MBA, Bachelor of Science) offered by this university."
                            selectedId={selectedProgram?.id ?? null}
                            onSelectItem={(item) => setSelectedProgram((current: any) => (current?.id === item.id ? null : item))}
                            fields={[
                                { key: "name", label: "Name", type: "text" },
                                { key: "level", label: "Level", type: "select", options: PROGRAM_LEVEL_OPTIONS, defaultValue: "UNDERGRADUATE" },
                                { key: "durationMonths", label: "Duration (months)", type: "number" },
                                { key: "description", label: "Description", type: "textarea" },
                                { key: "isActive", label: "Active", type: "boolean", defaultValue: true },
                            ]}
                        />
                    </div>
                </Card>
            ) : null}

            {selectedProgram ? (
                <Card className="rounded-2xl p-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground/60">
                        {selectedProgram.name}
                    </p>
                    <Tabs defaultValue="courses">
                        <TabsList className="h-auto flex-wrap justify-start">
                            <TabsTrigger value="courses">Courses</TabsTrigger>
                            <TabsTrigger value="intakes">Intakes</TabsTrigger>
                            <TabsTrigger value="fee-plans">Fee Plans</TabsTrigger>
                            <TabsTrigger value="scholarships">Scholarships</TabsTrigger>
                            <TabsTrigger value="eligibility">Eligibility</TabsTrigger>
                            <TabsTrigger value="stages">Stages</TabsTrigger>
                            <TabsTrigger value="checklists">Document Checklist</TabsTrigger>
                        </TabsList>

                        <TabsContent value="courses">
                            <CatalogEntityManager
                                entityKey="courses"
                                parentId={selectedProgram.id}
                                title="Courses"
                                emptyDescription="Add a course/major within this program."
                                fields={[
                                    { key: "name", label: "Name", type: "text" },
                                    { key: "code", label: "Code", type: "text" },
                                    { key: "description", label: "Description", type: "textarea" },
                                    { key: "isActive", label: "Active", type: "boolean", defaultValue: true },
                                ]}
                            />
                        </TabsContent>

                        <TabsContent value="intakes">
                            <CatalogEntityManager
                                entityKey="intakes"
                                parentId={selectedProgram.id}
                                title="Intakes"
                                emptyDescription="Add an admission cycle (e.g. Fall 2026) for this program."
                                fields={[
                                    { key: "name", label: "Name", type: "text" },
                                    { key: "startDate", label: "Start Date", type: "date" },
                                    { key: "endDate", label: "End Date", type: "date" },
                                    { key: "applicationDeadline", label: "Application Deadline", type: "date" },
                                    { key: "capacity", label: "Capacity", type: "number" },
                                    { key: "isActive", label: "Active", type: "boolean", defaultValue: true },
                                ]}
                            />
                        </TabsContent>

                        <TabsContent value="fee-plans">
                            <CatalogEntityManager
                                entityKey="fee-plans"
                                parentId={selectedProgram.id}
                                title="Fee Plans"
                                emptyDescription="Add a fee structure for this program."
                                fields={[
                                    { key: "name", label: "Name", type: "text" },
                                    { key: "currency", label: "Currency", type: "text", defaultValue: "INR" },
                                    { key: "applicationFee", label: "Application Fee", type: "number" },
                                    { key: "admissionFee", label: "Admission Fee", type: "number" },
                                    { key: "tuitionFeeTotal", label: "Tuition Fee Total", type: "number" },
                                    { key: "isActive", label: "Active", type: "boolean", defaultValue: true },
                                ]}
                            />
                        </TabsContent>

                        <TabsContent value="scholarships">
                            <CatalogEntityManager
                                entityKey="scholarship-rules"
                                parentId={selectedProgram.id}
                                title="Scholarships"
                                emptyDescription="Add a scholarship or discount rule for this program."
                                fields={[
                                    { key: "name", label: "Name", type: "text" },
                                    { key: "description", label: "Description", type: "textarea" },
                                    { key: "discountType", label: "Discount Type", type: "select", options: DISCOUNT_TYPE_OPTIONS, defaultValue: "PERCENTAGE" },
                                    { key: "discountValue", label: "Discount Value", type: "number" },
                                    { key: "isActive", label: "Active", type: "boolean", defaultValue: true },
                                ]}
                            />
                        </TabsContent>

                        <TabsContent value="eligibility">
                            <CatalogEntityManager
                                entityKey="eligibility-rules"
                                parentId={selectedProgram.id}
                                title="Eligibility Rules"
                                emptyDescription="Add an eligibility criterion applicants must meet for this program."
                                fields={[
                                    { key: "name", label: "Name", type: "text" },
                                    { key: "description", label: "Description", type: "textarea" },
                                    { key: "minEducationLevel", label: "Min Education Level", type: "text" },
                                    { key: "minPercentage", label: "Min Percentage", type: "number" },
                                    { key: "requiredEntranceExam", label: "Required Entrance Exam", type: "text" },
                                    { key: "isActive", label: "Active", type: "boolean", defaultValue: true },
                                ]}
                            />
                        </TabsContent>

                        <TabsContent value="stages">
                            <CatalogEntityManager
                                entityKey="application-stages"
                                parentId={selectedProgram.id}
                                title="Application Stages"
                                emptyDescription="Add a pipeline stage for applications to this program."
                                fields={[
                                    { key: "name", label: "Name", type: "text" },
                                    { key: "slaDays", label: "SLA (days)", type: "number" },
                                    { key: "color", label: "Color", type: "text", placeholder: "#3b82f6" },
                                    { key: "isClosed", label: "Closed stage", type: "boolean" },
                                    { key: "isWon", label: "Won/Enrolled stage", type: "boolean" },
                                ]}
                            />
                        </TabsContent>

                        <TabsContent value="checklists">
                            <CatalogEntityManager
                                entityKey="application-checklists"
                                parentId={selectedProgram.id}
                                title="Document Checklist"
                                emptyDescription="Add a required or optional document applicants must submit for this program."
                                fields={[
                                    { key: "name", label: "Name", type: "text" },
                                    { key: "description", label: "Description", type: "textarea" },
                                    { key: "isRequired", label: "Required", type: "boolean", defaultValue: true },
                                    { key: "isActive", label: "Active", type: "boolean", defaultValue: true },
                                ]}
                            />
                        </TabsContent>
                    </Tabs>
                </Card>
            ) : null}
        </div>
    );
}
