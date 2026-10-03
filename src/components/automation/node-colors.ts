// Automation step colours by category (UI/UX plan §5.12), from the chart tokens so they follow
// the theme and dark mode. There were 75 hard-coded hex values, one per step type.
type NodeCategory = "trigger" | "logic" | "timing" | "record" | "activity" | "assignment" | "message" | "rewards" | "integration" | "stop";

const CATEGORY_COLOR: Record<NodeCategory, string> = {
    trigger: "var(--chart-1)",
    logic: "var(--chart-4)",
    timing: "var(--chart-8)",
    record: "var(--chart-6)",
    activity: "var(--chart-2)",
    assignment: "var(--chart-3)",
    message: "var(--chart-5)",
    rewards: "var(--chart-4)",
    integration: "var(--chart-2)",
    stop: "var(--chart-7)",
};

const CATEGORY_BY_TYPE: Record<string, NodeCategory> = {
    trigger: "trigger",
    condition: "logic", if_else: "logic", multi_if_else: "logic", compare: "logic", split_test: "logic", branch: "logic",
    wait: "timing", delay: "timing", wait_until_activity: "timing", pause_case_sla: "timing", resume_case_sla: "timing",
    update_field: "record", update_lead: "record", update_opportunity: "record", update_activity: "record", change_stage: "record",
    clear_field: "record", tag_lead: "record", remove_tag: "record", add_to_list: "record", remove_from_list: "record", star_lead: "record",
    increment_score: "record", update_case: "record", close_case: "record", reopen_case: "record", apply_case_macro: "record", add_case_comment: "record",
    create_activity: "activity", add_activity: "activity", add_opportunity: "activity", create_task: "activity", apply_task_playbook: "activity",
    update_task: "activity", reschedule_task: "activity", complete_task: "activity", create_case: "activity",
    distribute_lead: "assignment", distribute_opportunity: "assignment", assign_owner: "assignment", assign_task: "assignment",
    share_opportunity: "assignment", stop_share_opportunity: "assignment", assign_case: "assignment", add_case_to_queue: "assignment", escalate_case: "assignment",
    send_email: "message", notify_user: "message", send_case_acknowledgement: "message", send_case_response: "message",
    calculate_commission: "rewards", award_points: "rewards", evaluate_badges: "rewards",
    webhook: "integration", run_automation: "integration", call_app_action: "integration",
    stop: "stop",
};

export function nodeColor(type: string | null | undefined) {
    return CATEGORY_COLOR[CATEGORY_BY_TYPE[String(type ?? "")] ?? "record"];
}
