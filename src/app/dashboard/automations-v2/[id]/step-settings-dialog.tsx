"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StandardDialog } from "@/components/common/standard-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Save, Split, User, Plus, Trash2, Info, Users } from "lucide-react";
import { DEFAULT_WORKSPACE_TIME_ZONE, getDisplaySettings } from "@/lib/date-format";
import { MultiValueDropdown, STEP_EXPLANATIONS } from "./builder-shared";
import type { AutomationBuilder } from "./use-automation-builder";

// The dialog that configures a step, moved here from page.tsx unchanged.
export function StepSettingsDialog({ s }: { s: AutomationBuilder }) {
    const { automationId, selectedNode, configDialogOpen, setConfigDialogOpen, description, triggerType, getAvailableTriggerTypes, activityTypes, opportunityTypes, users, teams, otherAutomations, taskPlaybooks, leadLists, availableAppActions, nodeConfig, setNodeConfig, updateNodeConfig, closeStepDialog, updateMultiBranch, addMultiBranch, removeMultiBranch, updateCondition, addCondition, removeCondition, updateFieldUpdate, addFieldUpdate, removeFieldUpdate, updateSplitVariant, addSplitVariant, removeSplitVariant, stageOptions, allConditionFields, defaultConditionField, fieldOptionsForValue, fieldOptionsForNode } = s;
    return (
        <>
            <StandardDialog
                open={configDialogOpen && Boolean(selectedNode)}
                onClose={closeStepDialog}
                title={String(selectedNode?.data?.label ?? "Configure Step")}
                subtitle="Choose conditions and actions from controlled lists wherever values are known."
                maxWidth="lg"
                actions={
                    <>
                        <Button variant="ghost" onClick={closeStepDialog}>Cancel</Button>
                        <Button
                            onClick={() => {
                                updateNodeConfig();
                                setConfigDialogOpen(false);
                            }}
                        >
                            Save Step
                        </Button>
                    </>
                }
            >
                {selectedNode ? (
                    <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-1">
                        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                            <div className="space-y-2">
                                <Label>Step Name</Label>
                                <Input value={nodeConfig.label || ""} onChange={(e) => setNodeConfig({ ...nodeConfig, label: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Step Type</Label>
                                <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm font-semibold">
                                    {selectedNode.data?.type}
                                </div>
                            </div>
                        </div>

                        {selectedNode.data?.type === 'trigger' && (
                            <div className="space-y-2 rounded-xl border bg-card p-4">
                                <Label>Trigger Event</Label>
                                <Select value={nodeConfig.triggerType || triggerType} onValueChange={(value) => setNodeConfig({ ...nodeConfig, triggerType: value })}>
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {getAvailableTriggerTypes(nodeConfig.triggerType || triggerType).map((trigger) => (
                                            <SelectItem key={trigger.value} value={trigger.value}>{trigger.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {['condition', 'multi_if_else', 'compare'].includes(selectedNode.data?.type) && (
                            <div className="space-y-3 rounded-xl border bg-card p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-semibold">Conditions</p>
                                        <p className="text-xs text-muted-foreground">Use known field values from dropdowns where available.</p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => addCondition()}>
                                        <Plus className="size-4" />
                                        Add Condition
                                    </Button>
                                </div>
                                <Select value={nodeConfig.conditionLogic || 'AND'} onValueChange={(value) => setNodeConfig({ ...nodeConfig, conditionLogic: value })}>
                                    <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="AND">Match all conditions</SelectItem>
                                        <SelectItem value="OR">Match any condition</SelectItem>
                                    </SelectContent>
                                </Select>
                                {(Array.isArray(nodeConfig.conditions) && nodeConfig.conditions.length > 0 ? nodeConfig.conditions : [{ field: '', operator: 'equals', value: '' }]).map((condition: any, index: number) => {
                                    const valueOptions = fieldOptionsForValue(condition.field);
                                    const valueDisabled = ['contains_data', 'not_contains_data'].includes(condition.operator || 'equals');
                                    return (
                                        <div key={index} className="grid gap-2 rounded-lg border bg-muted/20 p-3 md:grid-cols-[minmax(220px,1.2fr)_150px_minmax(220px,1fr)_auto] md:items-center">
                                            <Select value={condition.field || ''} onValueChange={(value) => updateCondition(index, { field: value, value: "" })}>
                                                <SelectTrigger><SelectValue placeholder="Field" /></SelectTrigger>
                                                <SelectContent>
                                                    {allConditionFields.map((field) => (
                                                        <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Select value={condition.operator || 'equals'} onValueChange={(value) => updateCondition(index, { operator: value })}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
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
                                            {valueOptions.length > 0 && !valueDisabled ? (
                                                <MultiValueDropdown
                                                    options={valueOptions}
                                                    value={condition.value}
                                                    onChange={(value) => updateCondition(index, { value })}
                                                    className="h-10 w-full"
                                                />
                                            ) : (
                                                <Input
                                                    value={valueDisabled ? "" : condition.value || ""}
                                                    disabled={valueDisabled}
                                                    placeholder={valueDisabled ? "Not required" : "Value"}
                                                    onChange={(e) => updateCondition(index, { value: e.target.value })}
                                                />
                                            )}
                                            <Button variant="ghost" size="icon-sm" onClick={() => removeCondition(index)} disabled={(nodeConfig.conditions ?? []).length <= 1}>
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </div>
                                    );
                                })}
                                {selectedNode.data?.type === 'multi_if_else' ? (
                                    <div className="space-y-3 rounded-lg border border-dashed bg-muted/20 p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-bold">Else-if branches</p>
                                                <p className="text-xs text-muted-foreground">Branches run top to bottom; Else runs when nothing matches.</p>
                                            </div>
                                            <Button variant="outline" size="sm" onClick={addMultiBranch}>
                                                <Plus className="size-4" />
                                                Add Else-if
                                            </Button>
                                        </div>
                                        {(Array.isArray(nodeConfig.branches) ? nodeConfig.branches : []).map((branch: any, branchIndex: number) => (
                                            <div key={branchIndex} className="space-y-3 rounded-lg border bg-background p-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-sm font-bold">Else If {branchIndex + 1}</p>
                                                    <div className="flex items-center gap-2">
                                                        <Select
                                                            value={branch.conditionLogic || "AND"}
                                                            onValueChange={(value) => updateMultiBranch(branchIndex, { conditionLogic: value })}
                                                        >
                                                            <SelectTrigger size="sm" className="w-[170px]"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="AND">Match all</SelectItem>
                                                                <SelectItem value="OR">Match any</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        <Button variant="ghost" size="icon-sm" onClick={() => removeMultiBranch(branchIndex)} aria-label={`Remove else if ${branchIndex + 1}`}>
                                                            <Trash2 className="size-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    {(Array.isArray(branch.conditions) && branch.conditions.length > 0 ? branch.conditions : [{ field: branch.field || '', operator: branch.operator || 'equals', value: branch.value || '' }]).map((condition: any, conditionIndex: number) => {
                                                        const valueOptions = fieldOptionsForValue(condition.field);
                                                        const valueDisabled = ['contains_data', 'not_contains_data'].includes(condition.operator || 'equals');
                                                        const branchConditions = Array.isArray(branch.conditions) ? [...branch.conditions] : [{ field: branch.field || '', operator: branch.operator || 'equals', value: branch.value || '' }];
                                                        const updateBranchCondition = (patch: Record<string, any>) => {
                                                            branchConditions[conditionIndex] = { ...(branchConditions[conditionIndex] ?? {}), ...patch };
                                                            updateMultiBranch(branchIndex, {
                                                                conditions: branchConditions,
                                                                field: branchConditions[0]?.field,
                                                                operator: branchConditions[0]?.operator,
                                                                value: branchConditions[0]?.value,
                                                            });
                                                        };
                                                        return (
                                                            <div key={conditionIndex} className="grid gap-2 rounded-md border bg-muted/20 p-2 md:grid-cols-[minmax(220px,1.2fr)_150px_minmax(220px,1fr)_auto] md:items-center">
                                                                <Select value={condition.field || ''} onValueChange={(value) => updateBranchCondition({ field: value, value: "" })}>
                                                                    <SelectTrigger><SelectValue placeholder="Field" /></SelectTrigger>
                                                                    <SelectContent>
                                                                        {allConditionFields.map((field) => (
                                                                            <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                                <Select value={condition.operator || 'equals'} onValueChange={(value) => updateBranchCondition({ operator: value })}>
                                                                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                                                                {valueOptions.length > 0 && !valueDisabled ? (
                                                                    <MultiValueDropdown
                                                                        options={valueOptions}
                                                                        value={condition.value}
                                                                        onChange={(value) => updateBranchCondition({ value })}
                                                                        className="h-10 w-full"
                                                                    />
                                                                ) : (
                                                                    <Input
                                                                        value={valueDisabled ? "" : condition.value || ""}
                                                                        disabled={valueDisabled}
                                                                        placeholder={valueDisabled ? "Not required" : "Value"}
                                                                        onChange={(event) => updateBranchCondition({ value: event.target.value })}
                                                                    />
                                                                )}
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon-sm"
                                                                    onClick={() => {
                                                                        const nextConditions = branchConditions.filter((_, index) => index !== conditionIndex);
                                                                        updateMultiBranch(branchIndex, {
                                                                            conditions: nextConditions,
                                                                            field: nextConditions[0]?.field,
                                                                            operator: nextConditions[0]?.operator,
                                                                            value: nextConditions[0]?.value,
                                                                        });
                                                                    }}
                                                                    disabled={branchConditions.length <= 1}
                                                                    aria-label={`Remove condition ${conditionIndex + 1}`}
                                                                >
                                                                    <Trash2 className="size-4" />
                                                                </Button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        const conditions = Array.isArray(branch.conditions) ? [...branch.conditions] : [{ field: branch.field || '', operator: branch.operator || 'equals', value: branch.value || '' }];
                                                        updateMultiBranch(branchIndex, { conditions: conditions.concat({ field: defaultConditionField, operator: "equals", value: [] }) });
                                                    }}
                                                >
                                                    <Plus className="size-4" />
                                                    Add condition
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        )}

                        {['update_field', 'update_lead', 'update_opportunity', 'update_activity'].includes(selectedNode.data?.type) && (
                            <div className="space-y-3 rounded-xl border bg-card p-4">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold">Field Updates</p>
                                    <Button variant="outline" size="sm" onClick={addFieldUpdate}>
                                        <Plus className="size-4" />
                                        Add Update
                                    </Button>
                                </div>
                                {(Array.isArray(nodeConfig.updates) && nodeConfig.updates.length > 0 ? nodeConfig.updates : [{ field: '', value: '' }]).map((update: any, index: number) => {
                                    const valueOptions = fieldOptionsForValue(update.field, fieldOptionsForNode);
                                    return (
                                        <div key={index} className="grid gap-2 rounded-lg border bg-muted/20 p-2 md:grid-cols-[1fr_1fr_auto]">
                                            <Select value={update.field || ''} onValueChange={(value) => updateFieldUpdate(index, { field: value, value: "" })}>
                                                <SelectTrigger><SelectValue placeholder="Field" /></SelectTrigger>
                                                <SelectContent>
                                                    {fieldOptionsForNode.map((field) => (
                                                        <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {valueOptions.length > 0 ? (
                                                <Select value={update.value || ''} onValueChange={(value) => updateFieldUpdate(index, { value })}>
                                                    <SelectTrigger><SelectValue placeholder="New value" /></SelectTrigger>
                                                    <SelectContent>
                                                        {valueOptions.map((option: { label: string; value: string }) => (
                                                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <Input value={update.value || ''} placeholder="New value" onChange={(e) => updateFieldUpdate(index, { value: e.target.value })} />
                                            )}
                                            <Button variant="ghost" size="icon-sm" onClick={() => removeFieldUpdate(index)} disabled={(nodeConfig.updates ?? []).length <= 1}>
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {['create_activity', 'add_activity'].includes(selectedNode.data?.type) && (
                            <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Activity Type</Label>
                                    <Select value={nodeConfig.activityTypeId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, activityTypeId: value, typeId: value })}>
                                        <SelectTrigger><SelectValue placeholder="Select activity type" /></SelectTrigger>
                                        <SelectContent>{activityTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Subject</Label>
                                    <Input value={nodeConfig.subject || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, subject: e.target.value })} />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label>Notes</Label>
                                    <Textarea rows={2} value={nodeConfig.notes || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, notes: e.target.value })} />
                                </div>
                            </div>
                        )}

                        {selectedNode.data?.type === 'add_opportunity' && (
                            <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-3">
                                <div className="space-y-2">
                                    <Label>Opportunity Type</Label>
                                    <Select value={nodeConfig.opportunityTypeId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, opportunityTypeId: value })}>
                                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                        <SelectContent>{opportunityTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Title</Label>
                                    <Input value={nodeConfig.title || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, title: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Amount</Label>
                                    <Input type="number" value={nodeConfig.amount || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, amount: e.target.value })} />
                                </div>
                            </div>
                        )}

                        {selectedNode.data?.type === 'create_task' && (
                            <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Task Title</Label>
                                    <Input value={nodeConfig.title || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, title: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Owner</Label>
                                    <Select value={nodeConfig.ownerId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, ownerId: value })}>
                                        <SelectTrigger><SelectValue placeholder="Record owner or select user" /></SelectTrigger>
                                        <SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name || user.email}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Priority</Label>
                                    <Select value={nodeConfig.priority || 'MEDIUM'} onValueChange={(value) => setNodeConfig({ ...nodeConfig, priority: value })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="LOW">Low</SelectItem>
                                            <SelectItem value="MEDIUM">Medium</SelectItem>
                                            <SelectItem value="HIGH">High</SelectItem>
                                            <SelectItem value="URGENT">Urgent</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Due At</Label>
                                    <Input type="datetime-local" value={nodeConfig.dueAt || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, dueAt: e.target.value })} />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label>Description</Label>
                                    <Textarea rows={2} value={nodeConfig.description || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, description: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Reminder At</Label>
                                    <Input type="datetime-local" value={nodeConfig.reminderAt || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, reminderAt: e.target.value })} />
                                </div>
                            </div>
                        )}

                        {selectedNode.data?.type === 'apply_task_playbook' && (
                            <div className="grid gap-4 rounded-xl border bg-card p-4">
                                <div className="space-y-2">
                                    <Label>Playbook</Label>
                                    <Select value={nodeConfig.playbookId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, playbookId: value })}>
                                        <SelectTrigger><SelectValue placeholder="Select a task playbook" /></SelectTrigger>
                                        <SelectContent>{taskPlaybooks.map((playbook) => <SelectItem key={playbook.id} value={playbook.id}>{playbook.name} ({playbook.itemCount} tasks)</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <Alert variant="info">
                                    <Info className="size-4" />
                                    <AlertDescription>Creates every task in the selected playbook against this record&apos;s Lead/Opportunity, due dates offset from when this step runs. Manage playbooks under Settings &gt; Task Playbooks.</AlertDescription>
                                </Alert>
                            </div>
                        )}

                        {['assign_task', 'reschedule_task', 'complete_task'].includes(selectedNode.data?.type) && (
                            <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
                                {selectedNode.data?.type === 'assign_task' && (
                                    <div className="space-y-2">
                                        <Label>Task Owner</Label>
                                        <Select value={nodeConfig.ownerId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, ownerId: value })}>
                                            <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                                            <SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name || user.email}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                )}
                                {selectedNode.data?.type === 'reschedule_task' && (
                                    <>
                                        <div className="space-y-2">
                                            <Label>Due At</Label>
                                            <Input type="datetime-local" value={nodeConfig.dueAt || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, dueAt: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Reminder At</Label>
                                            <Input type="datetime-local" value={nodeConfig.reminderAt || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, reminderAt: e.target.value })} />
                                        </div>
                                    </>
                                )}
                                {selectedNode.data?.type === 'complete_task' && (
                                    <Alert variant="info" className="md:col-span-2">
                                        <Info className="size-4" />
                                        <AlertDescription>This step marks the triggered task as completed and records the automation user as completer.</AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        )}

                        {['delay', 'wait', 'wait_until_activity', 'split_test'].includes(selectedNode.data?.type) && (
                            <div className="space-y-4 rounded-xl border bg-card p-4">
                                {selectedNode.data?.type === 'split_test' ? (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-semibold">Traffic Split</p>
                                                <p className="text-xs text-muted-foreground">Percentages are evaluated top to bottom.</p>
                                            </div>
                                            <Button variant="outline" size="sm" onClick={addSplitVariant}>
                                                <Plus className="size-4" />
                                                Add Variant
                                            </Button>
                                        </div>
                                        {(Array.isArray(nodeConfig.splits) ? nodeConfig.splits : [{ label: "Variant A", percentage: 50 }, { label: "Variant B", percentage: 50 }]).map((split: any, index: number) => (
                                            <div key={index} className="grid gap-2 rounded-lg border bg-muted/20 p-2 md:grid-cols-[1fr_120px_auto]">
                                                <Input value={split.label || ''} placeholder="Variant label" onChange={(event) => updateSplitVariant(index, { label: event.target.value })} />
                                                <Input type="number" min={0} max={100} value={split.percentage ?? 0} onChange={(event) => updateSplitVariant(index, { percentage: Number(event.target.value || 0) })} />
                                                <Button variant="ghost" size="icon-sm" onClick={() => removeSplitVariant(index)} disabled={(nodeConfig.splits ?? []).length <= 2} aria-label={`Remove variant ${index + 1}`}>
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Resume At</Label>
                                            <Input type="datetime-local" value={nodeConfig.runAt || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, runAt: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Timezone</Label>
                                            <Input value={nodeConfig.timezone || getDisplaySettings().timezone || DEFAULT_WORKSPACE_TIME_ZONE} onChange={(e) => setNodeConfig({ ...nodeConfig, timezone: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Fallback Duration</Label>
                                            <Input type="number" value={nodeConfig.duration || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, duration: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Unit</Label>
                                            <Select value={nodeConfig.unit || 'hours'} onValueChange={(value) => setNodeConfig({ ...nodeConfig, unit: value })}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="minutes">Minutes</SelectItem>
                                                    <SelectItem value="hours">Hours</SelectItem>
                                                    <SelectItem value="days">Days</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Allowed From</Label>
                                            <Input type="time" value={nodeConfig.allowedFrom || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, allowedFrom: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Allowed Until</Label>
                                            <Input type="time" value={nodeConfig.allowedUntil || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, allowedUntil: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Max Wait Minutes</Label>
                                            <Input type="number" min={0} value={nodeConfig.maxWaitMinutes || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, maxWaitMinutes: e.target.value })} />
                                        </div>
                                        {selectedNode.data?.type === 'wait_until_activity' ? (
                                            <>
                                                <div className="space-y-2">
                                                    <Label>Timeout Duration</Label>
                                                    <Input type="number" value={nodeConfig.timeoutDuration || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, timeoutDuration: e.target.value })} />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Timeout Action</Label>
                                                    <Select value={nodeConfig.timeoutAction || 'continue'} onValueChange={(value) => setNodeConfig({ ...nodeConfig, timeoutAction: value })}>
                                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="continue">Continue</SelectItem>
                                                            <SelectItem value="exit">Exit</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                        )}

                        {selectedNode.data?.type === 'assign_owner' && (
                            <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Record</Label>
                                    <Select value={nodeConfig.target || 'current'} onValueChange={(value) => setNodeConfig({ ...nodeConfig, target: value })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="current">Current record</SelectItem>
                                            <SelectItem value="lead">Lead</SelectItem>
                                            <SelectItem value="opportunity">Opportunity</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Owner</Label>
                                    <Select value={nodeConfig.ownerId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, ownerId: value })}>
                                        <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
                                        <SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name || user.email}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}

                        {selectedNode.data?.type === 'change_stage' && (
                            <div className="space-y-2 rounded-xl border bg-card p-4">
                                <Label>Stage</Label>
                                <Select value={nodeConfig.stageId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, stageId: value })}>
                                    <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                                    <SelectContent>{stageOptions.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.typeName}: {stage.name}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        )}

                        {selectedNode.data?.type === 'assign_case' && (
                            <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Owner</Label>
                                    <Select value={nodeConfig.ownerId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, ownerId: value })}>
                                        <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
                                        <SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name || user.email}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Reason (optional)</Label>
                                    <Input placeholder="Assigned by automation" value={nodeConfig.reason || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, reason: e.target.value })} />
                                </div>
                            </div>
                        )}

                        {selectedNode.data?.type === 'add_case_comment' && (
                            <div className="space-y-2 rounded-xl border bg-card p-4">
                                <Label>Comment</Label>
                                <Textarea rows={3} value={nodeConfig.body || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, body: e.target.value })} />
                                <label className="flex items-center gap-2 text-sm font-medium">
                                    <Switch checked={nodeConfig.isInternal !== false} onCheckedChange={(checked) => setNodeConfig({ ...nodeConfig, isInternal: checked })} />
                                    Internal note (not visible to the requester)
                                </label>
                            </div>
                        )}

                        {(selectedNode.data?.type === 'create_case' || selectedNode.data?.type === 'update_case') && (
                            <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Subject{selectedNode.data?.type === 'update_case' ? ' (leave blank to keep unchanged)' : ' (optional)'}</Label>
                                    <Input value={nodeConfig.subject || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, subject: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Description</Label>
                                    <Textarea rows={2} value={nodeConfig.description || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, description: e.target.value })} />
                                </div>
                            </div>
                        )}

                        {selectedNode.data?.type === 'escalate_case' && (
                            <div className="space-y-2 rounded-xl border bg-card p-4">
                                <Label>Escalate to (optional -- defaults to the owner&apos;s manager)</Label>
                                <Select value={nodeConfig.escalateToId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, escalateToId: value })}>
                                    <SelectTrigger><SelectValue placeholder="Owner's manager" /></SelectTrigger>
                                    <SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name || user.email}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        )}

                        {(selectedNode.data?.type === 'send_case_acknowledgement' || selectedNode.data?.type === 'send_case_response') && (
                            <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Channel</Label>
                                    <Select value={nodeConfig.channel || 'EMAIL'} onValueChange={(value) => setNodeConfig({ ...nodeConfig, channel: value })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="EMAIL">Email</SelectItem>
                                            <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                                            <SelectItem value="SMS">SMS</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label>Message (optional -- a sensible default is used if left blank)</Label>
                                    <Textarea rows={3} value={nodeConfig.body || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, body: e.target.value })} />
                                </div>
                            </div>
                        )}

                        {selectedNode.data?.type === 'apply_case_macro' && (
                            <div className="space-y-2 rounded-xl border bg-card p-4">
                                <Label>Macro ID</Label>
                                <Input placeholder="Copy from Settings > Service Desk > Macros" value={nodeConfig.macroId || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, macroId: e.target.value })} />
                            </div>
                        )}

                        {selectedNode.data?.type === 'add_case_to_queue' && (
                            <div className="space-y-2 rounded-xl border bg-card p-4">
                                <Label>Queue ID</Label>
                                <Input placeholder="Copy from Settings > Service Desk > Queues" value={nodeConfig.queueId || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, queueId: e.target.value })} />
                            </div>
                        )}

                        {(selectedNode.data?.type === 'pause_case_sla' || selectedNode.data?.type === 'resume_case_sla' || selectedNode.data?.type === 'close_case' || selectedNode.data?.type === 'reopen_case') && (
                            <Alert variant="info" className="text-[13px]">
                                <Info className="size-4" />
                                <AlertDescription>Acts on the triggering case directly -- no configuration needed.</AlertDescription>
                            </Alert>
                        )}

                        {(selectedNode.data?.type === 'share_opportunity' || selectedNode.data?.type === 'stop_share_opportunity') && (
                            <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
                                <Alert variant="info" className="text-[13px] md:col-span-2">
                                    <Info className="size-4" />
                                    <AlertDescription>
                                        {selectedNode.data?.type === 'share_opportunity'
                                            ? "Grants the selected users/teams access to this opportunity, in addition to anyone already shared with it -- doesn't remove existing shares."
                                            : "Removes just the selected users/teams from this opportunity's sharing. Leave both empty to clear all sharing on this record."}
                                    </AlertDescription>
                                </Alert>
                                <div className="space-y-2">
                                    <Label>Users</Label>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" className="w-full justify-between">
                                                {(nodeConfig.sharedUserIds ?? []).length === 0 ? "Select users" : `${(nodeConfig.sharedUserIds ?? []).length} selected`}
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start" className="max-h-64 w-72 overflow-y-auto">
                                            {users.map((option) => {
                                                const current: string[] = nodeConfig.sharedUserIds ?? [];
                                                return (
                                                    <DropdownMenuCheckboxItem
                                                        key={option.id}
                                                        checked={current.includes(option.id)}
                                                        onCheckedChange={(checked) => setNodeConfig({
                                                            ...nodeConfig,
                                                            sharedUserIds: checked ? [...new Set([...current, option.id])] : current.filter((id) => id !== option.id),
                                                        })}
                                                    >
                                                        {option.name || option.email}
                                                    </DropdownMenuCheckboxItem>
                                                );
                                            })}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <div className="space-y-2">
                                    <Label>Teams</Label>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" className="w-full justify-between">
                                                {(nodeConfig.sharedTeamIds ?? []).length === 0 ? "Select teams" : `${(nodeConfig.sharedTeamIds ?? []).length} selected`}
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start" className="max-h-64 w-72 overflow-y-auto">
                                            {teams.map((option) => {
                                                const current: string[] = nodeConfig.sharedTeamIds ?? [];
                                                return (
                                                    <DropdownMenuCheckboxItem
                                                        key={option.id}
                                                        checked={current.includes(option.id)}
                                                        onCheckedChange={(checked) => setNodeConfig({
                                                            ...nodeConfig,
                                                            sharedTeamIds: checked ? [...new Set([...current, option.id])] : current.filter((id) => id !== option.id),
                                                        })}
                                                    >
                                                        {option.name || option.id}
                                                    </DropdownMenuCheckboxItem>
                                                );
                                            })}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        )}

                        {['add_to_list', 'remove_from_list'].includes(selectedNode.data?.type) && (
                            <div className="space-y-2 rounded-xl border bg-card p-4">
                                <Label>Lead List</Label>
                                <Select value={nodeConfig.listId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, listId: value })}>
                                    <SelectTrigger><SelectValue placeholder="Select list" /></SelectTrigger>
                                    <SelectContent>{leadLists.filter((list) => list.type === 'STATIC').map((list) => <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        )}

                        {['tag_lead', 'remove_tag', 'star_lead', 'increment_score', 'stop'].includes(selectedNode.data?.type) && (
                            <div className="space-y-2 rounded-xl border bg-card p-4">
                                <Label>{selectedNode.data?.type === 'increment_score' ? 'Score Change' : selectedNode.data?.type === 'stop' ? 'Reason' : 'Value'}</Label>
                                <Input
                                    type={selectedNode.data?.type === 'increment_score' ? 'number' : 'text'}
                                    value={selectedNode.data?.type === 'stop' ? nodeConfig.reason || '' : nodeConfig.value || ''}
                                    onChange={(e) => setNodeConfig(selectedNode.data?.type === 'stop' ? { ...nodeConfig, reason: e.target.value } : { ...nodeConfig, value: e.target.value })}
                                />
                            </div>
                        )}

                        {selectedNode.data?.type === 'clear_field' && (
                            <div className="space-y-2 rounded-xl border bg-card p-4">
                                <Label>Field to Clear</Label>
                                <Select value={nodeConfig.field || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, field: value })}>
                                    <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
                                    <SelectContent>{fieldOptionsForNode.map((field) => <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        )}

                        {['send_email', 'notify_user', 'webhook'].includes(selectedNode.data?.type) && (
                            <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
                                {selectedNode.data?.type === 'send_email' ? (
                                    <div className="space-y-2">
                                        <Label>Channel</Label>
                                        <Select value={nodeConfig.channel || 'EMAIL'} onValueChange={(value) => setNodeConfig({ ...nodeConfig, channel: value })}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="EMAIL">Email</SelectItem>
                                                <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                                                <SelectItem value="SMS">SMS</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                ) : null}
                                {selectedNode.data?.type === 'notify_user' ? (
                                    <div className="space-y-2">
                                        <Label>User</Label>
                                        <Select value={nodeConfig.userId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, userId: value })}>
                                            <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                                            <SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name || user.email}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                ) : null}
                                {selectedNode.data?.type === 'webhook' ? (
                                    <>
                                        <div className="space-y-2">
                                            <Label>URL</Label>
                                            <Input value={nodeConfig.url || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, url: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Method</Label>
                                            <Select value={nodeConfig.method || 'POST'} onValueChange={(value) => setNodeConfig({ ...nodeConfig, method: value })}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="GET">GET</SelectItem>
                                                    <SelectItem value="POST">POST</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="space-y-2">
                                            <Label>{selectedNode.data?.type === 'send_email' ? 'To' : 'Title'}</Label>
                                            <Input value={selectedNode.data?.type === 'send_email' ? nodeConfig.to || '' : nodeConfig.title || ''} onChange={(e) => setNodeConfig(selectedNode.data?.type === 'send_email' ? { ...nodeConfig, to: e.target.value } : { ...nodeConfig, title: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Subject</Label>
                                            <Input value={nodeConfig.subject || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, subject: e.target.value })} />
                                        </div>
                                    </>
                                )}
                                <div className="space-y-2 md:col-span-2">
                                    <Label>{selectedNode.data?.type === 'webhook' ? 'Body (JSON)' : 'Message'}</Label>
                                    <Textarea rows={3} value={selectedNode.data?.type === 'webhook' ? nodeConfig.body || '' : nodeConfig.message || nodeConfig.body || ''} onChange={(e) => setNodeConfig(selectedNode.data?.type === 'webhook' ? { ...nodeConfig, body: e.target.value } : { ...nodeConfig, message: e.target.value, body: e.target.value })} />
                                </div>
                                {selectedNode.data?.type === 'send_email' && (
                                    <>
                                        <div className="space-y-2">
                                            <Label>Fallback Channel (optional)</Label>
                                            <Select
                                                value={nodeConfig.fallbackChannel || 'NONE'}
                                                onValueChange={(value) => setNodeConfig({ ...nodeConfig, fallbackChannel: value === 'NONE' ? '' : value })}
                                            >
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="NONE">None</SelectItem>
                                                    <SelectItem value="EMAIL">Email</SelectItem>
                                                    <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                                                    <SelectItem value="SMS">SMS</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Throttle (max sends / minute, optional)</Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                value={nodeConfig.throttlePerMinute ?? ''}
                                                onChange={(e) => setNodeConfig({ ...nodeConfig, throttlePerMinute: e.target.value })}
                                            />
                                        </div>
                                        {nodeConfig.fallbackChannel && (
                                            <>
                                                <div className="space-y-2 md:col-span-2">
                                                    <Label>Fallback Message</Label>
                                                    <Textarea rows={2} value={nodeConfig.fallbackMessage || ''} onChange={(e) => setNodeConfig({ ...nodeConfig, fallbackMessage: e.target.value })} />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Fallback Condition</Label>
                                                    <Select
                                                        value={nodeConfig.fallbackCondition || 'BLOCKED_OR_FAILED'}
                                                        onValueChange={(value) => setNodeConfig({ ...nodeConfig, fallbackCondition: value })}
                                                    >
                                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="BLOCKED_OR_FAILED">Immediately if blocked, or after send fails</SelectItem>
                                                            <SelectItem value="FAILED_ONLY">Only after send fails</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Fallback Delay (minutes)</Label>
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        value={nodeConfig.fallbackDelayMinutes ?? ''}
                                                        onChange={(e) => setNodeConfig({ ...nodeConfig, fallbackDelayMinutes: e.target.value })}
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        {['calculate_commission', 'award_points', 'evaluate_badges', 'distribute_lead', 'distribute_opportunity'].includes(selectedNode.data?.type) && (
                            <Alert variant="info">
                                <Info className="size-4" />
                                <AlertDescription>
                                    {STEP_EXPLANATIONS[String(selectedNode.data?.type)] ?? "This step uses the matching module configuration when it runs. No extra fields are required on the node."}
                                </AlertDescription>
                            </Alert>
                        )}

                        {selectedNode.data?.type === 'run_automation' && (
                            <div className="space-y-2 rounded-xl border bg-card p-4">
                                <Label>Automation to Run</Label>
                                <Select value={nodeConfig.targetAutomationId || ''} onValueChange={(value) => setNodeConfig({ ...nodeConfig, targetAutomationId: value })}>
                                    <SelectTrigger><SelectValue placeholder="Select an automation" /></SelectTrigger>
                                    <SelectContent>
                                        {otherAutomations.filter((item) => item.id !== automationId).map((item) => (
                                            <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Alert variant="info" className="text-[13px]">
                                    <Info className="size-4" />
                                    <AlertDescription>
                                        Runs the selected automation&apos;s own workflow for this record. A repeat visit back to an automation already running in this chain is silently skipped rather than looping forever.
                                    </AlertDescription>
                                </Alert>
                            </div>
                        )}

                        {selectedNode.data?.type === 'call_app_action' && (
                            <div className="space-y-2 rounded-xl border bg-card p-4">
                                <Label>App Action</Label>
                                <Select
                                    value={nodeConfig.appId && nodeConfig.actionKey ? `${nodeConfig.appId}|||${nodeConfig.actionKey}` : ''}
                                    onValueChange={(value) => {
                                        const [appId, actionKey] = value.split('|||');
                                        setNodeConfig({ ...nodeConfig, appId, actionKey, input: {} });
                                    }}
                                >
                                    <SelectTrigger><SelectValue placeholder="Select an app action" /></SelectTrigger>
                                    <SelectContent>
                                        {availableAppActions.map((action) => (
                                            <SelectItem key={action.id} value={`${action.appId}|||${action.key}`}>{action.appName} — {action.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {(availableAppActions.find((a) => a.appId === nodeConfig.appId && a.key === nodeConfig.actionKey)?.inputSchema ?? []).map((field: any) => (
                                    <div key={field.key} className="space-y-2">
                                        <Label>{field.label}{field.required ? ' *' : ''}</Label>
                                        {field.type === 'select' ? (
                                            <Select
                                                value={nodeConfig.input?.[field.key] ?? ''}
                                                onValueChange={(value) => setNodeConfig({ ...nodeConfig, input: { ...nodeConfig.input, [field.key]: value } })}
                                            >
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {(field.options ?? []).map((option: string) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <Input
                                                type={field.type === 'number' ? 'number' : 'text'}
                                                value={nodeConfig.input?.[field.key] ?? ''}
                                                placeholder="Literal value, or {{lead.email}} to pull from the triggering record"
                                                onChange={(e) => setNodeConfig({ ...nodeConfig, input: { ...nodeConfig.input, [field.key]: e.target.value } })}
                                            />
                                        )}
                                    </div>
                                ))}
                                <Alert variant="info" className="text-[13px]">
                                    <Info className="size-4" />
                                    <AlertDescription>
                                        Calls the selected app&apos;s declared action with these inputs, gated by the app&apos;s &quot;automations&quot; write permission grant. The call, its result, and any error are logged to that app&apos;s runtime audit log.
                                    </AlertDescription>
                                </Alert>
                            </div>
                        )}
                    </div>
                ) : null}
            </StandardDialog>
        </>
    );
}
