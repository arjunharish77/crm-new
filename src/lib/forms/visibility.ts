// Shared single-condition visibility engine for form fields, sections, and tabs.
// Previously duplicated verbatim between public-form-renderer.tsx and
// contextual-forms-panel.tsx (fields only) -- sections/tabs reuse the exact same rule
// shape (`FormField.logic`), so one evaluator now covers all three.
export type LogicRule = {
  action: "SHOW" | "HIDE";
  fieldId: string;
  operator?: "equals" | "not_equals" | "contains" | "gt" | "lt";
  value: string;
};

export function matchesLogicRule(formData: Record<string, any>, rule: LogicRule | undefined | null): boolean {
  if (!rule || !rule.fieldId) return true;

  const sourceValue = formData[rule.fieldId];
  const targetValue = rule.value;
  let isMatch = false;

  switch (rule.operator) {
    case "equals": isMatch = String(sourceValue) === String(targetValue); break;
    case "not_equals": isMatch = String(sourceValue) !== String(targetValue); break;
    case "contains": isMatch = String(sourceValue).includes(String(targetValue)); break;
    case "gt": isMatch = Number(sourceValue) > Number(targetValue); break;
    case "lt": isMatch = Number(sourceValue) < Number(targetValue); break;
    default: isMatch = String(sourceValue) === String(targetValue);
  }

  return rule.action === "SHOW" ? isMatch : !isMatch;
}
