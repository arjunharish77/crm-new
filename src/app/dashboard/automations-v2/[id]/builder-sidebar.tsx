"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExecutionLogViewer } from "@/components/automation/execution-log-viewer";
import { formatWorkspaceDateTime } from "@/lib/date-format";
import { MultiValueDropdown } from "./builder-shared";
import type { AutomationBuilder } from "./use-automation-builder";

// The builder's side panel (Designer, History and Steps tabs), moved here from page.tsx unchanged.
export function BuilderSidebar({ s }: { s: AutomationBuilder }) {
    const { activePanel, nodes, selectedNode, setAddAfterNodeId, triggerType, setTriggerType, getAvailableTriggerTypes, tabValue, setTabValue, executions, activityTypes, opportunityTypes, triggerOpportunityTypeId, setTriggerOpportunityTypeId, triggerActivityTypeId, setTriggerActivityTypeId, triggerAppId, setTriggerAppId, triggerEventName, setTriggerEventName, availableAutomationApps, maxExecutionsPerRecord, setMaxExecutionsPerRecord, maxStepsPerRun, setMaxStepsPerRun, exitConditionLogic, setExitConditionLogic, exitConditions, onNodeClick, addNode, stepOutline, focusStep, updateExitCondition, addExitCondition, removeExitCondition, triggerScope, isOpportunityScopedTrigger, isActivityScopedTrigger, allConditionFields, fieldOptionsForValue } = s;
    return (
        <>
                {/* Sidebar - Node Palette & Config */}
                <div className="builder-panel builder-library border-r bg-card" data-active={activePanel === "library"}>
                    <Tabs value={String(tabValue)} onValueChange={(v) => setTabValue(Number(v))}>
                        <TabsList className="h-auto w-full rounded-none border-b bg-transparent p-0">
                            <TabsTrigger
                                value="0"
                                className="flex-1 rounded-none border-b-2 border-transparent py-3 text-xs font-bold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                            >
                                Designer
                            </TabsTrigger>
                            <TabsTrigger
                                value="1"
                                className="flex-1 rounded-none border-b-2 border-transparent py-3 text-xs font-bold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                            >
                                History
                            </TabsTrigger>
                            <TabsTrigger
                                value="2"
                                className="flex-1 rounded-none border-b-2 border-transparent py-3 text-xs font-bold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                            >
                                Steps
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>

                    {tabValue === 2 ? (
                        // The steps as a list in flow order (UI/UX plan deferred item): for working
                        // without dragging on the canvas, and for keyboard and screen-reader use.
                        <div className="flex-1 overflow-y-auto p-3">
                            <p className="mb-2 px-1 text-xs text-muted-foreground">Steps in the order they run. Select a step on the canvas or here and press <kbd className="rounded border px-1">A</kbd> to add a step after it.</p>
                            <ol className="space-y-1">
                                {stepOutline.map(({ node, depth, viaLabel, connected }) => {
                                    const type = String(node.data?.type ?? "");
                                    const isSelected = selectedNode?.id === node.id;
                                    return (
                                        <li key={node.id} style={{ paddingLeft: `${Math.min(depth, 6) * 12}px` }}>
                                            <div className={cn("flex flex-wrap items-center gap-1 rounded-md border px-2 py-1.5", isSelected && "border-primary bg-primary/5")}>
                                                <button type="button" className="min-w-0 flex-1 basis-32 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => focusStep(node)}>
                                                    <span className="block truncate text-sm font-medium">{viaLabel ? <span className="text-muted-foreground">{viaLabel} → </span> : null}{String(node.data?.label ?? type)}</span>
                                                    <span className="block text-xs text-muted-foreground">{type === "branch" ? "Branch" : type.replace(/_/g, " ")}{connected ? "" : " · not connected"}</span>
                                                </button>
                                                {type !== "branch" ? <Button size="sm" variant="ghost" onClick={() => onNodeClick({} as React.MouseEvent, node)}>Configure</Button> : null}
                                                <Button size="sm" variant="ghost" aria-label={`Add a step after ${String(node.data?.label ?? type)}`} onClick={() => setAddAfterNodeId(node.id)}><Plus className="size-4" /></Button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>
                    ) : tabValue === 0 ? (
                        <div className="flex-1 overflow-y-auto p-3">
                            <div className="space-y-4">
                            {/* Basic Info */}
                            <div className="mb-4">
                                <p className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                    Details
                                </p>
                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <Label>Trigger</Label>
                                        <Select value={triggerType} onValueChange={(value) => setTriggerType(value)}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {getAvailableTriggerTypes(triggerType).map((trigger) => (
                                                    <SelectItem key={trigger.value} value={trigger.value}>{trigger.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {isOpportunityScopedTrigger && (
                                        <div className="space-y-1.5">
                                            <Label>Opportunity Type</Label>
                                            <Select value={triggerOpportunityTypeId} onValueChange={(value) => setTriggerOpportunityTypeId(String(value))}>
                                                <SelectTrigger className="w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {opportunityTypes.map((type) => (
                                                        <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                    {isActivityScopedTrigger && (
                                        <div className="space-y-1.5">
                                            <Label>Activity Type</Label>
                                            <Select value={triggerActivityTypeId} onValueChange={(value) => setTriggerActivityTypeId(String(value))}>
                                                <SelectTrigger className="w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {activityTypes.map((type) => (
                                                        <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                    {triggerScope === "app_event" && (
                                        <>
                                            <div className="space-y-1.5">
                                                <Label>App (leave unset for any app)</Label>
                                                <Select value={triggerAppId || "__any__"} onValueChange={(value) => setTriggerAppId(value === "__any__" ? "" : value)}>
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="__any__">Any app</SelectItem>
                                                        {availableAutomationApps.map((app) => (
                                                            <SelectItem key={app.appId} value={app.appId}>{app.appName}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>Event Name (leave blank for any event)</Label>
                                                <Input value={triggerEventName} onChange={(e) => setTriggerEventName(e.target.value)} placeholder="e.g. order.completed" />
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Node Add Guidance */}
                            <div className="mb-4">
                                <p className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                    Add Steps
                                </p>
                                <div className="rounded-lg border bg-muted/20 p-3">
                                    <p className="text-xs leading-5 text-muted-foreground">
                                        Use the + button on a node to add the next step. Branch nodes automatically create their paths.
                                    </p>
                                    {nodes.length === 0 && (
                                        <Button className="mt-3" onClick={() => addNode("trigger")}>
                                            Add trigger
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="mb-4">
                                <p className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                    Safety Guards
                                </p>
                                <div className="space-y-3 rounded-lg border p-3">
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <div className="space-y-1.5">
                                            <Label>Max runs per record</Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                max={100}
                                                value={maxExecutionsPerRecord}
                                                onChange={(event) => setMaxExecutionsPerRecord(Math.max(1, Number(event.target.value || 1)))}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>Max steps per run</Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                max={500}
                                                value={maxStepsPerRun}
                                                onChange={(event) => setMaxStepsPerRun(Math.max(1, Number(event.target.value || 1)))}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2 rounded-md bg-muted/30 p-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <div>
                                                <p className="text-xs font-semibold">Exit conditions</p>
                                                <p className="text-xs text-muted-foreground">Stop before running when these match.</p>
                                            </div>
                                            <Button variant="outline" size="sm" onClick={addExitCondition}>
                                                <Plus className="size-3.5" />
                                                Add
                                            </Button>
                                        </div>
                                        {exitConditions.length > 0 ? (
                                            <Select value={exitConditionLogic} onValueChange={(value) => setExitConditionLogic(value as "AND" | "OR")}>
                                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="OR">Exit when any condition matches</SelectItem>
                                                    <SelectItem value="AND">Exit when all conditions match</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        ) : null}
                                        <div className="space-y-2">
                                            {exitConditions.map((condition, index) => {
                                                const options = fieldOptionsForValue(condition.field);
                                                const valueDisabled = ['contains_data', 'not_contains_data'].includes(condition.operator || 'equals');
                                                return (
                                                    <div key={index} className="grid gap-2 rounded-md border bg-background p-2">
                                                        <Select value={condition.field || ""} onValueChange={(value) => updateExitCondition(index, { field: value, value: "" })}>
                                                            <SelectTrigger className="h-9"><SelectValue placeholder="Field" /></SelectTrigger>
                                                            <SelectContent>
                                                                {allConditionFields.map((field) => (
                                                                    <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <div className="grid gap-2 sm:grid-cols-[130px_1fr_auto]">
                                                            <Select value={condition.operator || "equals"} onValueChange={(value) => updateExitCondition(index, { operator: value })}>
                                                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="equals">Is</SelectItem>
                                                                    <SelectItem value="not_equals">Is not</SelectItem>
                                                                    <SelectItem value="in">Is one of</SelectItem>
                                                                    <SelectItem value="not_in">Is not one of</SelectItem>
                                                                    <SelectItem value="contains">Contains</SelectItem>
                                                                    <SelectItem value="contains_data">Has value</SelectItem>
                                                                    <SelectItem value="not_contains_data">No value</SelectItem>
                                                                    <SelectItem value="greater_than">Greater than</SelectItem>
                                                                    <SelectItem value="less_than">Less than</SelectItem>
                                                                    <SelectItem value="before">Before</SelectItem>
                                                                    <SelectItem value="after">After</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                            {options.length > 0 && !valueDisabled ? (
                                                                <MultiValueDropdown
                                                                    options={options}
                                                                    value={condition.value}
                                                                    onChange={(value) => updateExitCondition(index, { value })}
                                                                    className="h-9 w-full"
                                                                />
                                                            ) : (
                                                                <Input
                                                                    className="h-9"
                                                                    value={valueDisabled ? "" : condition.value || ""}
                                                                    disabled={valueDisabled}
                                                                    placeholder={valueDisabled ? "Not required" : "Value"}
                                                                    onChange={(event) => updateExitCondition(index, { value: event.target.value })}
                                                                />
                                                            )}
                                                            <Button variant="ghost" size="icon-sm" onClick={() => removeExitCondition(index)} aria-label="Remove exit condition">
                                                                <Trash2 className="size-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            </div>

                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto p-3">
                            <p className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                Execution Log
                            </p>
                            {executions.length === 0 ? (
                                <div className="p-8 text-center">
                                    <p className="text-sm text-muted-foreground/60">No executions yet</p>
                                </div>
                            ) : (
                                <div className="mt-3 space-y-3">
                                    {executions.map((exe) => (
                                        <div key={exe.id} className="rounded-2xl border p-3">
                                            <div className="mb-1.5 flex items-center justify-between">
                                                <Badge
                                                    variant="outline"
                                                    className={cn(
                                                        "h-5 text-xs font-bold",
                                                        exe.status === 'COMPLETED' && "border-status-success bg-status-success text-status-success-foreground",
                                                        exe.status === 'FAILED' && "border-destructive/30 bg-destructive/10 text-destructive",
                                                        exe.status !== 'COMPLETED' && exe.status !== 'FAILED' && "border-primary/30 bg-primary/10 text-primary"
                                                    )}
                                                >
                                                    {exe.status}
                                                </Badge>
                                                <span className="text-xs text-muted-foreground">
                                                    {formatWorkspaceDateTime(exe.startedAt)}
                                                </span>
                                            </div>
                                            <p className="text-xs font-semibold">
                                                {String(exe.entityType || "Record").replace(/_/g, " ")}
                                            </p>
                                            {exe.executionLog?.steps && (
                                                <div className="mt-2 border-t pt-2">
                                                    <ExecutionLogViewer steps={exe.executionLog.steps} />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
        </>
    );
}
