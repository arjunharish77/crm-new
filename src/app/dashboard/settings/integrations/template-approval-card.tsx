"use client";

import { useState, useEffect } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StandardDialog } from "@/components/common/standard-dialog";
import { apiFetch } from "@/lib/api";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { toast } from "sonner";
import { useConfirm } from "@/components/common/dialogs-provider";
import { CHANNELS, CommunicationTemplate, TemplateApprovalStatus } from "./integrations-shared";


// Template approval and versions (UI/UX plan decision 33). Every save of a template adds a new
// version in Draft; an admin requests approval, then approves or rejects it. With "Require
// approval" on (decided 2026-10-03; off by default) only Approved versions send, and the author
// of a version can't approve it -- the server enforces both.
export const TEMPLATE_APPROVAL: Record<TemplateApprovalStatus, { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' }> = {
    DRAFT: { label: 'Draft', tone: 'neutral' },
    PENDING_APPROVAL: { label: 'Waiting for approval', tone: 'warning' },
    APPROVED: { label: 'Approved', tone: 'success' },
    REJECTED: { label: 'Rejected', tone: 'danger' },
};


export function TemplateApprovalCard({ templates, onUpdated, onEdit }: {
    templates: CommunicationTemplate[];
    onUpdated: (template: CommunicationTemplate) => void;
    onEdit: (template: CommunicationTemplate) => void;
}) {
    const confirm = useConfirm();
    const { user } = useAuth();
    const [busyId, setBusyId] = useState<string | null>(null);
    const [requireApproval, setRequireApproval] = useState<boolean | null>(null);
    const [savingSetting, setSavingSetting] = useState(false);
    const [versionsFor, setVersionsFor] = useState<CommunicationTemplate | null>(null);
    const [versions, setVersions] = useState<CommunicationTemplate[] | null>(null);
    const [versionsFailed, setVersionsFailed] = useState(false);

    const loadVersions = async (template: CommunicationTemplate) => {
        setVersions(null);
        setVersionsFailed(false);
        try {
            const params = new URLSearchParams({ channel: template.channel, name: template.name, locale: template.locale || 'en' });
            const data = await apiFetch<CommunicationTemplate[]>(`/communications/templates/versions?${params.toString()}`);
            setVersions(Array.isArray(data) ? data : []);
        } catch {
            setVersionsFailed(true);
        }
    };

    useEffect(() => {
        let cancelled = false;
        apiFetch<{ requireTemplateApproval: boolean }>('/communications/settings')
            .then((settings) => { if (!cancelled) setRequireApproval(!!settings?.requireTemplateApproval); })
            .catch(() => { if (!cancelled) setRequireApproval(false); });
        return () => { cancelled = true; };
    }, []);

    const changeRequireApproval = async (next: boolean) => {
        if (next) {
            const unapproved = templates.filter((template) => template.approvalStatus !== 'APPROVED').length;
            const ok = await confirm({
                title: 'Send only approved templates?',
                description: unapproved
                    ? `${unapproved} ${unapproved === 1 ? 'template isn\'t' : 'templates aren\'t'} approved yet and will stop sending until approved, including from campaigns. The author of a version can't approve it, so this needs at least two admins.`
                    : 'From now on a template sends only once it\'s approved, and the author of a version can\'t approve it, so this needs at least two admins.',
                confirmLabel: 'Require approval',
            });
            if (!ok) return;
        }
        setSavingSetting(true);
        try {
            const saved = await apiFetch<{ requireTemplateApproval: boolean }>('/communications/settings', { method: 'PUT', body: JSON.stringify({ requireTemplateApproval: next }) });
            setRequireApproval(!!saved?.requireTemplateApproval);
            toast.success(next ? 'Only approved templates will send' : 'Templates send without approval');
        } catch (error: any) {
            toast.error(error?.message || 'The setting couldn\'t be saved');
        } finally {
            setSavingSetting(false);
        }
    };

    const openVersions = (template: CommunicationTemplate) => {
        setVersionsFor(template);
        loadVersions(template);
    };

    const setApproval = async (template: CommunicationTemplate, status: Exclude<TemplateApprovalStatus, 'DRAFT'>) => {
        if (!template.id) return;
        const label = `${template.name}${template.version ? ` v${template.version}` : ''}`;
        if (status === 'REJECTED' && !(await confirm({ title: `Reject ${label}?`, description: 'It stays in Rejected until someone edits and saves it as a new version, then requests approval again.', confirmLabel: 'Reject template', destructive: true }))) return;
        if (status === 'APPROVED' && !(await confirm({ title: `Approve ${label}?`, description: 'Editing it later creates a new version that needs approval again.', confirmLabel: 'Approve template' }))) return;
        setBusyId(template.id);
        try {
            const updated = await apiFetch<CommunicationTemplate>(`/communications/templates/${template.id}/approval`, { method: 'POST', body: JSON.stringify({ status }) });
            onUpdated(updated);
            if (versionsFor && versionsFor.name === updated.name && versionsFor.channel === updated.channel) {
                setVersions((current) => current?.map((item) => (item.id === updated.id ? updated : item)) ?? current);
            }
            toast.success(status === 'PENDING_APPROVAL' ? 'Approval requested' : status === 'APPROVED' ? 'Template approved' : 'Template rejected');
        } catch (error: any) {
            toast.error(error?.message || 'The approval status couldn\'t be changed');
        } finally {
            setBusyId(null);
        }
    };

    const approvalActions = (template: CommunicationTemplate) => {
        const status = template.approvalStatus ?? 'DRAFT';
        const busy = busyId === template.id;
        if (status === 'DRAFT' || status === 'REJECTED') {
            return <Button size="sm" variant="outline" disabled={busy} onClick={() => setApproval(template, 'PENDING_APPROVAL')}>Request approval</Button>;
        }
        if (status === 'PENDING_APPROVAL') {
            const ownVersion = !!requireApproval && !!user?.id && template.createdBy === user.id;
            return <>
                {ownVersion
                    ? <span className="text-xs text-muted-foreground">Another admin approves your version</span>
                    : <Button size="sm" variant="outline" disabled={busy} onClick={() => setApproval(template, 'APPROVED')}>Approve</Button>}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setApproval(template, 'REJECTED')}>Reject</Button>
            </>;
        }
        return null;
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Templates</CardTitle>
                <CardDescription>The current version of each template and its review status. Saving a template adds a new version in Draft.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex flex-wrap items-start gap-3 rounded-lg border p-3">
                    <Switch
                        id="require-template-approval"
                        checked={!!requireApproval}
                        disabled={requireApproval === null || savingSetting}
                        onCheckedChange={changeRequireApproval}
                    />
                    <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                        <Label htmlFor="require-template-approval">Send only approved templates</Label>
                        <p className="text-xs text-muted-foreground">
                            {requireApproval
                                ? 'On: a template version sends only once approved, and its author can\'t approve it.'
                                : 'Off: approval is a review record; any template can be sent.'}
                        </p>
                    </div>
                </div>
                {templates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No templates yet. Save one below to add it here.</p>
                ) : (
                    <ul className="divide-y rounded-lg border">
                        {templates.map((template) => {
                            const approval = TEMPLATE_APPROVAL[template.approvalStatus ?? 'DRAFT'] ?? TEMPLATE_APPROVAL.DRAFT;
                            const channel = CHANNELS.find((item) => item.value === template.channel);
                            return (
                                <li key={template.id ?? `${template.channel}-${template.name}`} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                                    <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <span className="min-w-0 break-words text-sm font-medium">{template.name}</span>
                                            <Badge tone={approval.tone}>{approval.label}</Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {[channel?.label ?? template.channel, template.version ? `Version ${template.version}` : null, template.locale && template.locale !== 'en' ? template.locale : null, template.approvalStatus === 'APPROVED' && template.approvedAt ? `Approved ${formatWorkspaceDateTime(template.approvedAt)}` : null].filter(Boolean).join(' · ')}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1">
                                        {approvalActions(template)}
                                        <Button size="sm" variant="ghost" onClick={() => onEdit(template)}>Edit</Button>
                                        <Button size="sm" variant="ghost" onClick={() => openVersions(template)}>Versions</Button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </CardContent>

            <StandardDialog
                open={!!versionsFor}
                onClose={() => setVersionsFor(null)}
                title={versionsFor ? `Versions of ${versionsFor.name}` : 'Versions'}
                subtitle="Newest first. Campaigns keep the version they were saved with."
                maxWidth="sm"
                actions={<Button variant="ghost" onClick={() => setVersionsFor(null)}>Close</Button>}
            >
                {versionsFailed ? (
                    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">The versions couldn&apos;t be loaded. <Button variant="outline" size="sm" onClick={() => versionsFor && loadVersions(versionsFor)}>Try again</Button></div>
                ) : versions === null ? (
                    <p role="status" className="text-sm text-muted-foreground">Loading versions…</p>
                ) : versions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No versions found.</p>
                ) : (
                    <ol className="space-y-2">
                        {versions.map((version, index) => {
                            const approval = TEMPLATE_APPROVAL[version.approvalStatus ?? 'DRAFT'] ?? TEMPLATE_APPROVAL.DRAFT;
                            return (
                                <li key={version.id} className="space-y-2 rounded-lg border p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-semibold">Version {version.version}</span>
                                            {index === 0 ? <Badge tone="info">Current</Badge> : null}
                                            <Badge tone={approval.tone}>{approval.label}</Badge>
                                        </div>
                                        <span className="text-xs text-muted-foreground">{version.createdAt ? formatWorkspaceDateTime(version.createdAt) : null}</span>
                                    </div>
                                    {version.subject ? <p className="text-sm font-medium">{version.subject}</p> : null}
                                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 font-sans text-xs">{version.body}</pre>
                                    <div className="flex flex-wrap gap-1 empty:hidden">{approvalActions(version)}</div>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </StandardDialog>
        </Card>
    );
}
