"use client";

import 'reactflow/dist/style.css';
import { BuilderWorkspace } from "@/components/layout/builder-workspace";
import Link from "next/link";
import ReactFlow, { MiniMap, Controls, Background, BackgroundVariant, MarkerType, ReactFlowProvider } from "reactflow";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { StandardDialog } from "@/components/common/standard-dialog";
import { ArrowLeft, FlaskConical, Loader2, Users, History, Rocket, Undo2, Redo2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { ErrorState } from "@/components/common/error-state";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { TestWorkflowDialog } from "@/components/automation/TestWorkflowDialog";
import { EnrollRecordsDialog } from "@/components/automation/EnrollRecordsDialog";
import { purgeDate } from "@/hooks/use-archive-actions";
import { nodeTypes } from "./builder-shared";
import { useAutomationBuilder } from "./use-automation-builder";
import { BuilderSidebar } from "./builder-sidebar";
import { StepSettingsDialog } from "./step-settings-dialog";
import { AddStepDialog } from "./add-step-dialog";

function AutomationBuilderContent() {
    // State and handlers live in useAutomationBuilder; the side panel and the step dialogs are
    // their own components.
    const s = useAutomationBuilder();
    const { activePanel, setActivePanel, automationId, isNew, nodes, onNodesChange, edges, onEdgesChange, loading, setLoading, saving, showTestDialog, setShowTestDialog, showEnrollDialog, setShowEnrollDialog, setReactFlowInstance, name, setName, description, isActive, archivedAt, publishedVersion, hasDraft, loadError, setLoadError, fetchAutomation, onConnect, onNodeClick, onNodesChangeWithoutKeyboardDelete, snapshot, savedSnapshot, nameError, setNameError, restoreArchived, saveState, publishOpen, setPublishOpen, publishNotes, setPublishNotes, publishing, openPublish, publish, changeSummary, discardChanges, versionsOpen, setVersionsOpen, versions, versionsError, openVersions, restoreVersion, toggleActive, historyCounts, undo, redo, flowNodes, isOpportunityScopedTrigger } = s;
    if (loadError) {
        return (
            <div className="p-4">
                <Button variant="ghost" size="sm" asChild><Link href="/dashboard/automations-v2"><ArrowLeft className="size-4" />Automations</Link></Button>
                {loadError === 'missing'
                    ? <ErrorState title="Automation not found" description="It may have been deleted." />
                    : <ErrorState description="The automation couldn't be loaded." onRetry={() => { setLoadError(null); setLoading(true); fetchAutomation(); }} />}
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <motion.div
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            className="flex min-w-0 flex-col"
        >
            {archivedAt ? (
                <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b bg-status-warning px-3 py-2 text-sm text-status-warning-foreground">
                    <span>This automation is archived and doesn&apos;t run. It will be deleted on {purgeDate(archivedAt)}.</span>
                    <Button size="sm" variant="outline" onClick={restoreArchived}>Restore</Button>
                </div>
            ) : null}
            {/* Header: the name is edited here, with its error beside it (UI/UX plan §5.12). */}
            <div className="flex flex-wrap items-center gap-3 border-b bg-card px-3 py-2.5">
                <Button variant="ghost" size="icon-sm" asChild>
                    <Link href="/dashboard/automations-v2" aria-label="Back to automations"><ArrowLeft className="size-4" /></Link>
                </Button>
                <div className="min-w-0 flex-1 basis-56">
                    <label htmlFor="automation-name" className="sr-only">Automation name</label>
                    <Input
                        id="automation-name"
                        value={name}
                        placeholder="Name this automation"
                        aria-invalid={!!nameError}
                        aria-describedby={nameError ? "automation-name-error" : undefined}
                        onChange={(e) => { setName(e.target.value); if (nameError) setNameError(null); }}
                        className="h-9 max-w-md border-transparent bg-transparent px-2 text-base font-semibold shadow-none hover:border-input focus-visible:border-input"
                    />
                    {nameError ? <p id="automation-name-error" className="px-2 text-xs text-destructive">{nameError}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {/* Save state (decision 29): drafts save themselves; Publish makes them live. */}
                    <span className="text-xs text-muted-foreground" aria-live="polite">
                        {archivedAt ? null
                            : saveState === 'saving' ? 'Saving…'
                            : saveState === 'error' && snapshot !== savedSnapshot ? "Couldn't save · ⌘S to retry"
                            : snapshot !== savedSnapshot ? (name.trim() ? 'Unsaved changes' : 'Name it to save')
                            : publishedVersion === 0 ? 'Draft · not published yet'
                            : hasDraft ? `Draft saved · version ${publishedVersion} is live`
                            : `Version ${publishedVersion} is live`}
                    </span>
                    <IconButton label="Undo (⌘Z)" variant="ghost" size="icon-sm" disabled={!historyCounts.past || !!archivedAt} onClick={undo}><Undo2 className="size-4" /></IconButton>
                    <IconButton label="Redo (⇧⌘Z)" variant="ghost" size="icon-sm" disabled={!historyCounts.future || !!archivedAt} onClick={redo}><Redo2 className="size-4" /></IconButton>
                    {!isNew && (
                        <Button variant="ghost" size="sm" onClick={openVersions}>
                            <History className="size-4" />
                            Versions
                        </Button>
                    )}
                    {hasDraft && publishedVersion > 0 && !archivedAt ? (
                        <Button variant="ghost" size="sm" onClick={discardChanges}>Discard changes</Button>
                    ) : null}
                    {!isNew && (
                        <Button variant="outline" size="sm" onClick={() => setShowTestDialog(true)} title="Tries what's in the builder, including unpublished changes">
                            <FlaskConical className="size-4" />
                            Test
                        </Button>
                    )}
                    {!isNew && publishedVersion > 0 && (
                        <Button variant="outline" size="sm" onClick={() => setShowEnrollDialog(true)} title={`Runs version ${publishedVersion} for the records you choose`}>
                            <Users className="size-4" />
                            Enroll
                        </Button>
                    )}
                    <div className="flex items-center gap-2" title={publishedVersion === 0 ? "Publish it before turning it on" : undefined}>
                        <Switch id="automation-active" checked={isActive} disabled={isNew || publishedVersion === 0 || !!archivedAt} onCheckedChange={toggleActive} />
                        <Label htmlFor="automation-active" className="text-sm font-normal">{isActive ? "On" : "Off"}</Label>
                    </div>
                    <Button
                        size="sm"
                        onClick={openPublish}
                        isLoading={publishing || (saveState === 'saving' && publishOpen)}
                        disabled={!!archivedAt || (publishedVersion > 0 && !hasDraft && snapshot === savedSnapshot)}
                        title={archivedAt ? "Restore the automation to make changes" : "Make these changes live"}
                    >
                        <Rocket className="size-4" />
                        Publish
                    </Button>
                </div>
            </div>

            <StandardDialog
                open={publishOpen}
                onClose={() => setPublishOpen(false)}
                title={`Publish version ${publishedVersion + 1}?`}
                subtitle={publishedVersion === 0 ? "It becomes the version that runs once you turn the automation on." : isActive ? "It replaces what runs now, straight away." : "It becomes the version that runs when the automation is on."}
                maxWidth="sm"
                actions={
                    <>
                        <Button variant="ghost" onClick={() => setPublishOpen(false)}>Cancel</Button>
                        <Button onClick={publish} isLoading={publishing}><Rocket className="size-4" />Publish</Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div>
                        <p className="mb-1.5 text-sm font-medium">What changes</p>
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                            {changeSummary.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="publish-notes">Notes (optional)</Label>
                        <Textarea id="publish-notes" rows={2} value={publishNotes} onChange={(e) => setPublishNotes(e.target.value)} placeholder="What changed and why, for the version history" />
                    </div>
                </div>
            </StandardDialog>

            <StandardDialog open={versionsOpen} onClose={() => setVersionsOpen(false)} title="Versions" subtitle="Each publish is kept. Restore one as the draft, then publish it to make it live again." maxWidth="sm">
                {versionsError ? (
                    <ErrorState variant="inline" description="Versions couldn't be loaded." onRetry={openVersions} />
                ) : !versions ? (
                    <p role="status" className="text-sm text-muted-foreground">Loading versions…</p>
                ) : !versions.length ? (
                    <p className="text-sm text-muted-foreground">Not published yet. Publish to create version 1.</p>
                ) : (
                    <ul className="divide-y rounded-lg border">
                        {versions.map((version) => (
                            <li key={version.version} className="flex flex-wrap items-center justify-between gap-3 p-3">
                                <div className="min-w-0 flex-1 basis-56">
                                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                                        Version {version.version}
                                        {version.version === publishedVersion ? <Badge tone="success">Live</Badge> : null}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {formatWorkspaceDateTime(version.publishedAt)}{version.publishedByName ? ` · ${version.publishedByName}` : ''} · {version.stepCount} step{version.stepCount === 1 ? '' : 's'}
                                    </p>
                                    {version.notes ? <p className="mt-0.5 break-words text-xs">{version.notes}</p> : null}
                                </div>
                                {version.version !== publishedVersion ? (
                                    <Button size="sm" variant="outline" onClick={() => restoreVersion(version.version)} disabled={!!archivedAt}>Restore as draft</Button>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
            </StandardDialog>

            <BuilderWorkspace layout="flow" activePanel={activePanel} onPanelChange={setActivePanel} panels={[{ id: "canvas", label: "Canvas" }, { id: "library", label: "Workflow & history" }]}>

                <BuilderSidebar s={s} />

                {/* Canvas */}
                <div className="builder-panel relative bg-background" data-active={activePanel === "canvas"}>
                    <ReactFlow
                        nodes={flowNodes}
                        edges={edges}
                        onNodesChange={onNodesChangeWithoutKeyboardDelete}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={onNodeClick}
                        onInit={setReactFlowInstance}
                        nodeTypes={nodeTypes}
                        snapToGrid={true}
                        snapGrid={[12, 12]}
                        fitView
                        defaultEdgeOptions={{
                            type: 'smoothstep',
                            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--primary)' },
                            style: { strokeWidth: 2, stroke: 'var(--primary)' }
                        }}
                    >
                        <Controls className="bg-background border-muted rounded-xl shadow-lg" />
                        <MiniMap className="bg-background border-muted rounded-xl shadow-lg" />
                        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="color-mix(in srgb, var(--primary) 10%, transparent)" />
                    </ReactFlow>
                </div>
            </BuilderWorkspace>

            {/* Test Dialog */}
            {!isNew && (
                <TestWorkflowDialog
                    open={showTestDialog}
                    onClose={() => setShowTestDialog(false)}
                    automationId={automationId}
                    automationName={name}
                />
            )}
            {!isNew && (
                <EnrollRecordsDialog
                    open={showEnrollDialog}
                    onClose={() => setShowEnrollDialog(false)}
                    automationId={automationId}
                    automationName={name}
                    defaultEntityType={isOpportunityScopedTrigger ? "OPPORTUNITY" : "LEAD"}
                />
            )}
            <StepSettingsDialog s={s} />
            <AddStepDialog s={s} />
        </motion.div>
    );
}


export default function AutomationBuilderPage() {
    return (
        <ReactFlowProvider>
            <AutomationBuilderContent />
        </ReactFlowProvider>
    );
}
