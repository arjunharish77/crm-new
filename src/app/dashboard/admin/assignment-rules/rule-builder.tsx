"use client";

import { useState, useEffect } from "react";
import { X, Users, UsersRound, Trash2, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface RuleBuilderProps {
    open: boolean;
    setOpen: (open: boolean) => void;
    rule?: any;
    onSave: (rule: any) => Promise<void>;
}

const NO_FALLBACK = "__none__";

export function RuleBuilder({ open, setOpen, rule, onSave }: RuleBuilderProps) {
    const [form, setForm] = useState<any>({
        name: "",
        description: "",
        entityType: "LEAD",
        type: "ROUND_ROBIN",
        priority: 100,
        isActive: true,
    });
    const [config, setConfig] = useState<any>({
        userPool: [],
        salesGroupId: undefined,
        fallbackUserId: undefined,
        matchingKeys: {},
    });
    const [targetType, setTargetType] = useState<"USER_POOL" | "SALES_GROUP">("USER_POOL");

    const [users, setUsers] = useState<any[]>([]);
    const [salesGroups, setSalesGroups] = useState<any[]>([]);

    useEffect(() => {
        if (open) {
            apiFetch("/users").then(setUsers).catch(() => toast.error("Failed to load users"));
            apiFetch("/sales-groups").then(setSalesGroups).catch(() => toast.error("Failed to load sales groups"));
        }
    }, [open]);

    // Initialize from existing rule
    useEffect(() => {
        if (rule) {
            setForm({
                name: rule.name,
                description: rule.description || "",
                entityType: rule.entityType,
                type: rule.type,
                priority: rule.priority ?? 100,
                isActive: rule.isActive,
            });

            const ruleConfig = rule.config || {};
            if (ruleConfig.salesGroupId) {
                setTargetType("SALES_GROUP");
                setConfig({ ...ruleConfig, userPool: [] }); // Clear pool if group used
            } else {
                setTargetType("USER_POOL");
                setConfig({ ...ruleConfig, salesGroupId: undefined });
            }
        } else {
            // Reset for new rule
            setForm({
                name: "",
                description: "",
                entityType: "LEAD",
                type: "ROUND_ROBIN",
                priority: 100,
                isActive: true,
            });
            setConfig({
                userPool: [],
                salesGroupId: undefined,
                fallbackUserId: undefined,
                matchingKeys: {},
            });
            setTargetType("USER_POOL");
        }
    }, [rule, open]);

    const handleSave = async () => {
        const payload = { ...form, config: { ...config } };

        // Clean up config based on type
        if (targetType === "SALES_GROUP") {
            delete payload.config.userPool;
        } else {
            delete payload.config.salesGroupId;
        }

        try {
            await onSave(payload);
            setOpen(false);
        } catch (error) {
            // Handled by parent
        }
    };

    // State for new matching key inputs
    const [newEntityField, setNewEntityField] = useState("");
    const [newSkillKey, setNewSkillKey] = useState("");

    const addMatchingKey = () => {
        if (newEntityField && newSkillKey) {
            const current = { ...config.matchingKeys };
            current[newEntityField] = newSkillKey;
            setConfig({ ...config, matchingKeys: current });
            setNewEntityField("");
            setNewSkillKey("");
        }
    };

    const removeMatchingKey = (key: string) => {
        const current = { ...config.matchingKeys };
        delete current[key];
        setConfig({ ...config, matchingKeys: current });
    };

    const handleClose = () => setOpen(false);

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent
                side="right"
                showCloseButton={false}
                className="w-full gap-0 sm:max-w-[600px] md:max-w-[800px]"
            >
                <SheetHeader className="flex-row items-center justify-between gap-3 border-b p-4">
                    <div>
                        <SheetTitle className="text-base">
                            {rule ? "Edit Assignment Rule" : "Create Assignment Rule"}
                        </SheetTitle>
                        <SheetDescription>
                            Define how leads should be routed to your team.
                        </SheetDescription>
                    </div>
                    <Button variant="ghost" size="icon" onClick={handleClose}>
                        <X className="size-4" />
                    </Button>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-4">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="rule-name-input">Rule Name</Label>
                            <Input
                                id="rule-name-input"
                                placeholder="e.g. Inbound Leads - North America"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rule-description-input">Description</Label>
                            <Textarea
                                id="rule-description-input"
                                placeholder="When this rule should run and who should receive the record"
                                rows={2}
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                            />
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-2">
                                <Label>Entity Type</Label>
                                <Select
                                    value={form.entityType}
                                    onValueChange={(value) => setForm({ ...form, entityType: value })}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="LEAD">Lead</SelectItem>
                                        <SelectItem value="OPPORTUNITY">Opportunity</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Assignment Strategy</Label>
                                <Select
                                    value={form.type}
                                    onValueChange={(value) => setForm({ ...form, type: value })}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ROUND_ROBIN">Round Robin</SelectItem>
                                        <SelectItem value="LOAD_BASED">Load Based</SelectItem>
                                        <SelectItem value="SKILL_BASED">Skill Based</SelectItem>
                                        <SelectItem value="WEIGHTED">Weighted Round Robin</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="rule-priority-input">Priority</Label>
                                <Input
                                    id="rule-priority-input"
                                    type="number"
                                    value={form.priority}
                                    onChange={(e) => setForm({ ...form, priority: Number(e.target.value) || 0 })}
                                />
                                <p className="text-xs text-muted-foreground">Higher priority runs first</p>
                            </div>
                        </div>

                        <div className="rounded-lg border p-4">
                            <p className="mb-3 text-sm font-semibold">Routing Target</p>

                            <div className="mb-4 flex gap-2">
                                <Button
                                    type="button"
                                    variant={targetType === "USER_POOL" ? "default" : "outline"}
                                    onClick={() => setTargetType("USER_POOL")}
                                >
                                    <Users className="size-4" />
                                    Specific Users
                                </Button>
                                <Button
                                    type="button"
                                    variant={targetType === "SALES_GROUP" ? "default" : "outline"}
                                    onClick={() => setTargetType("SALES_GROUP")}
                                >
                                    <UsersRound className="size-4" />
                                    Sales Group
                                </Button>
                            </div>

                            {targetType === "USER_POOL" ? (
                                <div>
                                    <p className="mb-2 text-sm">Select Users</p>
                                    <div className="max-h-[200px] overflow-y-auto rounded-md border p-2">
                                        <div className="grid grid-cols-2 gap-1">
                                            {users.map((u) => (
                                                <label
                                                    key={u.id}
                                                    className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent"
                                                >
                                                    <Checkbox
                                                        checked={config.userPool?.includes(u.id)}
                                                        onCheckedChange={(checked) => {
                                                            const pool = config.userPool || [];
                                                            if (checked) {
                                                                setConfig({ ...config, userPool: [...pool, u.id] });
                                                            } else {
                                                                setConfig({ ...config, userPool: pool.filter((id: string) => id !== u.id) });
                                                            }
                                                        }}
                                                    />
                                                    {u.name}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <Label>Select Sales Group</Label>
                                    <Select
                                        value={config.salesGroupId || ""}
                                        onValueChange={(value) => setConfig({ ...config, salesGroupId: value })}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select Sales Group" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {salesGroups.map((g) => (
                                                <SelectItem key={g.id} value={g.id}>
                                                    {g.name} ({g._count?.members || 0} members)
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>

                        <div className="rounded-lg border p-4">
                            <p className="mb-3 text-sm font-semibold">Fallback Owner</p>
                            <div className="space-y-2">
                                <Label>Fallback User</Label>
                                <Select
                                    value={config.fallbackUserId || NO_FALLBACK}
                                    onValueChange={(value) =>
                                        setConfig({ ...config, fallbackUserId: value === NO_FALLBACK ? undefined : value })
                                    }
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NO_FALLBACK}>
                                            <em>No fallback</em>
                                        </SelectItem>
                                        {users.map((u) => (
                                            <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Used when the rule matches but no target user is eligible.
                                </p>
                            </div>
                        </div>

                        <div className="rounded-lg border bg-muted/20 p-4">
                            <p className="mb-2 text-sm font-semibold">Rule Criteria</p>
                            <p className="mb-3 text-sm text-muted-foreground">
                                Add field/value conditions. All conditions must match before distribution runs.
                            </p>

                            <div className="mb-1 grid grid-cols-12 gap-2">
                                <p className="col-span-5 text-xs font-semibold text-muted-foreground">Record Field</p>
                                <p className="col-span-5 text-xs font-semibold text-muted-foreground">Expected Value</p>
                                <div className="col-span-2" />
                            </div>

                            {Object.entries(config.matchingKeys || {}).map(([entityField, userSkillKey], index) => (
                                <div key={index} className="mb-1 grid grid-cols-12 items-center gap-2">
                                    <Input value={entityField} disabled className="col-span-5 bg-background" />
                                    <Input value={userSkillKey as string} disabled className="col-span-5 bg-background" />
                                    <div className="col-span-2 flex justify-end">
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() => removeMatchingKey(entityField)}
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}

                            <div className="grid grid-cols-12 items-center gap-2">
                                <Input
                                    className="col-span-5"
                                    placeholder={form.entityType === "LEAD" ? "source" : "priority"}
                                    value={newEntityField}
                                    onChange={(e) => setNewEntityField(e.target.value)}
                                />
                                <Input
                                    className="col-span-5"
                                    placeholder={form.entityType === "LEAD" ? "Website" : "HIGH"}
                                    value={newSkillKey}
                                    onChange={(e) => setNewSkillKey(e.target.value)}
                                />
                                <div className="col-span-2 flex justify-end">
                                    <Button type="button" size="icon-sm" onClick={addMatchingKey}>
                                        <Plus className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <SheetFooter className="flex-row justify-end gap-2 border-t p-4">
                    <Button variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave}>
                        Save Rule
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
