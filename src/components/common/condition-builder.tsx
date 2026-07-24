"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type CrmCondition = {
  field: string;
  operator: string;
  value?: string | number | boolean | string[] | null;
};

export type ConditionFieldOption = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "boolean" | "select";
  options?: Array<string | { value: string; label: string }>;
};

const TEXT_OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Does not equal" },
  { value: "contains", label: "Contains" },
  { value: "contains_data", label: "Has any value" },
  { value: "not_contains_data", label: "Is empty" },
];

const NUMBER_OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Does not equal" },
  { value: "greater_than", label: "Greater than" },
  { value: "greater_than_or_equal", label: "Greater than or equal" },
  { value: "less_than", label: "Less than" },
  { value: "less_than_or_equal", label: "Less than or equal" },
  { value: "contains_data", label: "Has any value" },
  { value: "not_contains_data", label: "Is empty" },
];

const DATE_OPERATORS = [
  { value: "before", label: "Before" },
  { value: "after", label: "After" },
  { value: "equals", label: "On" },
  { value: "contains_data", label: "Has any value" },
  { value: "not_contains_data", label: "Is empty" },
];

const BOOLEAN_OPTIONS = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

function normalizeOption(option: string | { value: string; label: string }) {
  return typeof option === "string" ? { value: option, label: option } : option;
}

function operatorsFor(field?: ConditionFieldOption) {
  if (!field) return TEXT_OPERATORS;
  if (field.options?.length || field.type === "select" || field.type === "boolean") {
    return [
      { value: "equals", label: "Is" },
      { value: "not_equals", label: "Is not" },
      { value: "in", label: "Is one of" },
      { value: "not_in", label: "Is not one of" },
      { value: "contains_data", label: "Has any value" },
      { value: "not_contains_data", label: "Is empty" },
    ];
  }
  if (field.type === "number") return NUMBER_OPERATORS;
  if (field.type === "date") return DATE_OPERATORS;
  return TEXT_OPERATORS;
}

function defaultOperatorFor(field?: ConditionFieldOption) {
  return operatorsFor(field)[0]?.value ?? "equals";
}

function valueOptionsFor(field?: ConditionFieldOption) {
  if (!field) return [];
  if (field.type === "boolean") return BOOLEAN_OPTIONS;
  return (field.options ?? []).map(normalizeOption);
}

function inputTypeFor(field?: ConditionFieldOption) {
  if (field?.type === "number") return "number";
  if (field?.type === "date") return "date";
  return "text";
}

function selectedValues(value: unknown) {
  return Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
}

export function ConditionBuilder({
  title = "Conditions",
  description,
  fields,
  conditions,
  logic = "AND",
  onLogicChange,
  onChange,
  className,
}: {
  title?: string;
  description?: string;
  fields: ConditionFieldOption[];
  conditions: CrmCondition[];
  logic?: "AND" | "OR";
  onLogicChange?: (logic: "AND" | "OR") => void;
  onChange: (conditions: CrmCondition[]) => void;
  className?: string;
}) {
  const updateCondition = (index: number, patch: Partial<CrmCondition>) => {
    onChange(conditions.map((condition, conditionIndex) => conditionIndex === index ? { ...condition, ...patch } : condition));
  };
  const addCondition = () => {
    const field = fields[0];
    onChange([...conditions, { field: field?.key ?? "", operator: defaultOperatorFor(field), value: "" }]);
  };
  const removeCondition = (index: number) => onChange(conditions.filter((_, conditionIndex) => conditionIndex !== index));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label className="text-xs font-bold uppercase text-muted-foreground">{title}</Label>
          {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {onLogicChange ? (
            <Select value={logic} onValueChange={(value) => onLogicChange(value as "AND" | "OR")}>
              <SelectTrigger size="sm" className="w-[142px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AND">All conditions</SelectItem>
                <SelectItem value="OR">Any condition</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={addCondition}>Add Condition</Button>
        </div>
      </div>

      {conditions.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
          No conditions. This configuration applies whenever the event and audience match.
        </div>
      ) : (
        <div className="space-y-2">
          {conditions.map((condition, index) => {
            const selectedField = fields.find((field) => field.key === condition.field);
            const options = valueOptionsFor(selectedField);
            const operator = condition.operator || defaultOperatorFor(selectedField);
            const valueDisabled = operator === "contains_data" || operator === "not_contains_data";
            const values = selectedValues(condition.value);

            return (
              <div key={index} className="grid gap-2 rounded-lg border bg-surface-container-low p-2 md:grid-cols-[minmax(180px,1.3fr)_minmax(160px,1fr)_minmax(160px,1fr)_auto] md:items-end">
                <div className="space-y-1.5">
                  <Label>Field</Label>
                  <Select
                    value={condition.field}
                    onValueChange={(fieldKey) => {
                      const nextField = fields.find((field) => field.key === fieldKey);
                      updateCondition(index, { field: fieldKey, operator: defaultOperatorFor(nextField), value: "" });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select field" />
                    </SelectTrigger>
                    <SelectContent>
                      {fields.map((field) => (
                        <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Operator</Label>
                  <Select value={operator} onValueChange={(value) => updateCondition(index, { operator: value })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {operatorsFor(selectedField).map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Value</Label>
                  {valueDisabled ? (
                    <Input value="" disabled placeholder="Not required" />
                  ) : options.length > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline" className="w-full justify-between">
                          {values.length === 0
                            ? "Select values"
                            : values.length === 1
                              ? options.find((option) => option.value === values[0])?.label ?? "1 selected"
                              : `${values.length} selected`}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="max-h-64 w-64 overflow-y-auto">
                        {options.map((option) => (
                          <DropdownMenuCheckboxItem
                            key={option.value}
                            checked={values.includes(option.value)}
                            onCheckedChange={(checked) => {
                              const nextValues = checked
                                ? [...new Set([...values, option.value])]
                                : values.filter((value) => value !== option.value);
                              updateCondition(index, { value: nextValues });
                            }}
                            onSelect={(event) => event.preventDefault()}
                          >
                            {option.label}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Input
                      type={inputTypeFor(selectedField)}
                      value={String(condition.value ?? "")}
                      onChange={(event) => updateCondition(index, { value: event.target.value })}
                    />
                  )}
                </div>

                <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeCondition(index)} aria-label="Remove condition">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
