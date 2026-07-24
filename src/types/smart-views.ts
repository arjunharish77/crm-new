import { FilterConfig } from "@/types/filters";

export type SmartViewModule =
    | "LEADS"
    | "OPPORTUNITIES"
    | "ACTIVITIES"
    | "TASKS"
    | "PARTNERS"
    | "PAYOUTS"
    | "REPORTS";

export type SmartViewDensity = "compact" | "comfortable" | "spacious";

export type SmartViewScope = "PRIVATE" | "SHARED" | "ROLE" | "TENANT_DEFAULT";

export type SmartViewSort = {
    field: string;
    order: "asc" | "desc";
};

export type SmartViewChart = {
    type: "none" | "count" | "bar" | "donut";
    metric?: "count" | "sum" | "average";
    field?: string | null;
};

export type SmartViewCountChip = {
    id: string;
    label: string;
    field: string;
    operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than";
    value: string;
};

export type SmartViewTab = {
    id: string;
    name: string;
    module: SmartViewModule;
    filters: FilterConfig;
    density?: SmartViewDensity;
    columns?: string[];
    sort?: SmartViewSort | null;
    groupBy?: string | null;
    chart?: SmartViewChart;
    countChips?: SmartViewCountChip[];
    quickActions?: string[];
};
