"use client";

import { useEffect, useState } from "react";
import { ArrowRight as ArrowRightIcon, Plus as PlusIcon, Trash2 as DeleteIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface LogicRule {
    action: "SHOW" | "HIDE";
    fieldId: string;
    operator: "equals" | "not_equals" | "contains" | "gt" | "lt";
    value: string;
}

interface LogicBuilderProps {
    fields: any[];
    currentFieldId: string;
    value?: LogicRule;
    onChange: (value: LogicRule | undefined) => void;
}

export function ConditionalLogicBuilder({ fields, currentFieldId, value, onChange }: LogicBuilderProps) {
    const [rule, setRule] = useState<LogicRule>(value || {
        action: "SHOW",
        fieldId: "",
        operator: "equals",
        value: ""
    });

    useEffect(() => {
        if (value) {
            setRule(value);
        }
    }, [value]);

    const updateRule = (updates: Partial<LogicRule>) => {
        const newRule = { ...rule, ...updates };
        setRule(newRule);
        onChange(newRule);
    };

    const clearRule = () => {
        onChange(undefined);
        setRule({
            action: "SHOW",
            fieldId: "",
            operator: "equals",
            value: ""
        });
    };

    const sourceFields = fields.filter((f) => f.id !== currentFieldId);

    if (!value && !rule.fieldId) {
        return (
            <div className="rounded-lg border border-dashed bg-muted/40 p-6 text-center">
                <p className="mb-2 text-sm text-muted-foreground">
                    No conditional logic applied.
                </p>
                <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full"
                    onClick={() => updateRule({ fieldId: sourceFields[0]?.id || "" })}
                >
                    <PlusIcon className="size-4" />
                    Add Rule
                </Button>
            </div>
        );
    }

    return (
        <div className="rounded-lg border bg-primary/[0.02] p-4">
            <div className="mb-3 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                    <ArrowRightIcon className="size-3.5" /> Condition
                </p>
                <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={clearRule}
                >
                    <DeleteIcon className="size-3.5" />
                </Button>
            </div>

            <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                    <span>Then</span>
                    <Select value={rule.action} onValueChange={(v) => updateRule({ action: v as LogicRule["action"] })}>
                        <SelectTrigger size="sm" className="w-[100px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="SHOW">Show</SelectItem>
                            <SelectItem value="HIDE">Hide</SelectItem>
                        </SelectContent>
                    </Select>
                    <span>this field when:</span>
                </div>

                <Select value={rule.fieldId} onValueChange={(v) => updateRule({ fieldId: v })}>
                    <SelectTrigger size="sm" className="w-full">
                        <SelectValue placeholder="Field" />
                    </SelectTrigger>
                    <SelectContent>
                        {sourceFields.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                                {f.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <div className="flex gap-2">
                    <Select value={rule.operator} onValueChange={(v) => updateRule({ operator: v as LogicRule["operator"] })}>
                        <SelectTrigger size="sm" className="w-[40%]">
                            <SelectValue placeholder="Operator" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="equals">Equals</SelectItem>
                            <SelectItem value="not_equals">Not Equals</SelectItem>
                            <SelectItem value="contains">Contains</SelectItem>
                            <SelectItem value="gt">Greater Than</SelectItem>
                            <SelectItem value="lt">Less Than</SelectItem>
                        </SelectContent>
                    </Select>
                    <Input
                        placeholder="Value"
                        className="h-8 flex-1"
                        value={rule.value}
                        onChange={(e) => updateRule({ value: e.target.value })}
                    />
                </div>
            </div>
        </div>
    );
}
