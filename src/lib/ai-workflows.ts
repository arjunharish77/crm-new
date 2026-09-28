/** Record workflows shared by the assistant picker and server dispatcher. */
export const AI_RECORD_WORKFLOWS = [
  { key: "review_qualification", label: "Qualification review", description: "Identify missing qualification details and questions for the next conversation." },
  { key: "plan_reengagement", label: "Follow-up plan", description: "Review engagement gaps and suggest three next steps for a stalled record." },
  { key: "prepare_objection_coaching", label: "Objection preparation", description: "Separate recorded objections from possible concerns and prepare responses." },
  { key: "prepare_handoff", label: "Rep handoff brief", description: "Prepare context, open commitments and a checklist for the next owner." },
] as const;
export type AiRecordWorkflow = typeof AI_RECORD_WORKFLOWS[number]["key"];
