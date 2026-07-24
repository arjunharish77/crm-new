"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { formatWorkspaceRelativeTime } from "@/lib/date-format";
import {
    Filter as FilterListIcon,
    FileText as DescriptionIcon,
    Loader2,
    MoreVertical as MoreVertIcon,
    Pencil as EditIcon,
    Plus as PlusIcon,
    Search as SearchIcon,
    Trash2 as DeleteIcon,
    Eye as VisibilityIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/common/empty-state";
import { QueueExportButton } from "@/components/exports/queue-export-button";

interface Form {
    id: string;
    name: string;
    description?: string;
    slug: string;
    isActive: boolean;
    createdAt: string;
    _count?: {
        submissions: number;
    };
}

export default function FormsPage() {
    const [forms, setForms] = useState<Form[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [newFormName, setNewFormName] = useState("");
    const [creating, setCreating] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const router = useRouter();

    const fetchForms = async () => {
        setLoading(true);
        try {
            const data: any = await apiFetch("/forms");
            setForms(Array.isArray(data) ? data : []);
        } catch (error: any) {
            toast.error(error.message || "Failed to load forms");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchForms();
    }, []);

    const handleCreate = async () => {
        if (!newFormName.trim()) return;
        setCreating(true);
        try {
            const newForm: any = await apiFetch("/forms", {
                method: "POST",
                body: JSON.stringify({ name: newFormName, isActive: true }),
            });
            toast.success("Form created");
            setCreateOpen(false);
            setNewFormName("");
            router.push(`/dashboard/forms/${newForm.id}`);
        } catch (error: any) {
            toast.error(error.message || "Failed to create form");
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (formId: string) => {
        if (!confirm("Are you sure? This will delete the form and all submissions.")) return;

        try {
            await apiFetch(`/forms/${formId}`, { method: "DELETE" });
            toast.success("Form deleted");
            fetchForms();
        } catch (error) {
            toast.error("Failed to delete form");
        }
    };

    const filteredForms = forms.filter(f =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getFormSlug = (slug: string) => {
        // Use window.location.origin if available, otherwise just relative
        if (typeof window !== 'undefined') {
            return `${window.location.origin}/f/${slug}`;
        }
        return `/f/${slug}`;
    };

    return (
        <div className="mx-auto max-w-[1600px] px-4 py-4 md:px-6">
            {/* Header Section */}
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-xl font-semibold tracking-normal text-foreground">Forms</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Create and manage lead capture forms for your campaigns.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <QueueExportButton moduleName="FORMS" filters={{ search: searchQuery || null }} />
                    <Button onClick={() => setCreateOpen(true)}>
                        <PlusIcon className="size-4" />
                        Create Form
                    </Button>
                </div>
            </div>

            {/* Filter Bar */}
            <Card className="mb-4 flex-row items-center gap-3 rounded-xl p-3">
                <div className="relative max-w-[400px] flex-1">
                    <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search forms..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8"
                    />
                </div>
                <Button variant="outline">
                    <FilterListIcon className="size-4" />
                    Filters
                </Button>
            </Card>

            {/* Content Area */}
            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="size-8 animate-spin text-primary" />
                </div>
            ) : filteredForms.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-primary/[0.02]">
                    <EmptyState
                        icon={<DescriptionIcon className="size-10 text-muted-foreground opacity-50" />}
                        title="No forms found"
                        description={searchQuery ? "Try adjusting your search terms" : "Create your first form to start collecting leads"}
                        action={!searchQuery && (
                            <Button onClick={() => setCreateOpen(true)}>Create Form</Button>
                        )}
                    />
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredForms.map((form) => (
                        <Card
                            key={form.id}
                            className="cursor-pointer gap-0 rounded-xl py-0 transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
                            onClick={() => router.push(`/dashboard/forms/${form.id}`)}
                        >
                            <CardContent className="p-4">
                                <div className="mb-3 flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-base font-semibold">{form.name}</p>
                                        <div className="mt-1 flex items-center gap-1.5">
                                            <Badge variant={form.isActive ? "default" : "outline"} className="h-5 rounded-md text-[10px] font-bold">
                                                {form.isActive ? "Active" : "Draft"}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                                &bull; {formatWorkspaceRelativeTime(form.createdAt)}
                                            </span>
                                        </div>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <MoreVertIcon className="size-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-40" onClick={(e) => e.stopPropagation()}>
                                            <DropdownMenuItem onClick={() => router.push(`/dashboard/forms/${form.id}`)}>
                                                <EditIcon className="size-4 text-muted-foreground" />
                                                Edit
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => window.open(getFormSlug(form.slug), '_blank')}>
                                                <VisibilityIcon className="size-4 text-muted-foreground" />
                                                View Public
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                variant="destructive"
                                                onClick={() => handleDelete(form.id)}
                                            >
                                                <DeleteIcon className="size-4" />
                                                Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>

                                <p className="mb-3 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                                    {form.description || "No description provided."}
                                </p>

                                <div className="my-2 h-px w-full bg-border" />

                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">
                                        <b>{form._count?.submissions || 0}</b> Submissions
                                    </span>
                                    <Button variant="ghost" size="sm">
                                        Edit
                                        <EditIcon className="size-3.5" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Create Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Create New Form</DialogTitle>
                        <DialogDescription>
                            Give your form a name to get started. You can configure fields later.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-1.5">
                        <Label htmlFor="new-form-name">Form Name</Label>
                        <Input
                            id="new-form-name"
                            autoFocus
                            placeholder="e.g. Contact Us"
                            value={newFormName}
                            onChange={(e) => setNewFormName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreate} disabled={!newFormName.trim() || creating}>
                            {creating ? <Loader2 className="size-4 animate-spin" /> : null}
                            {creating ? "Creating..." : "Create & Edit"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
