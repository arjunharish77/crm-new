import { describe, expect, it } from "vitest";
import { messageOutcomeForEvent, nextMessageOutcome } from "@/lib/repositories/activities-postgres";
import { assertWorkflowStepsSupported } from "@/lib/repositories/automations-postgres";
import { toStoredValue } from "@/lib/repositories/custom-field-values-postgres";

// Voice bot plan wave A: sent-message activity outcomes, the automation step allow-list and
// custom field value typing. The database behaviour is in scripts/system-activity-smoke.ts.
describe("sent-message activity outcomes", () => {
  it("maps delivery events to outcomes", () => {
    expect(messageOutcomeForEvent("SENT")).toBe("SENT");
    expect(messageOutcomeForEvent("delivered")).toBe("DELIVERED");
    expect(messageOutcomeForEvent("OPENED")).toBe("READ");
    expect(messageOutcomeForEvent("READ")).toBe("READ");
    expect(messageOutcomeForEvent("SUPPRESSED")).toBe("NOT_SENT");
    expect(messageOutcomeForEvent("HARD_BOUNCE")).toBe("BOUNCED");
    expect(messageOutcomeForEvent("UNDELIVERED")).toBe("FAILED");
    expect(messageOutcomeForEvent("RETRY_SCHEDULED")).toBeNull();
  });

  it("only moves forward, whatever order events arrive in", () => {
    expect(nextMessageOutcome("QUEUED", "SENT")).toBe("SENT");
    expect(nextMessageOutcome("DELIVERED", "SENT")).toBe("DELIVERED");
    expect(nextMessageOutcome("READ", "DELIVERED")).toBe("READ");
    expect(nextMessageOutcome(null, "SENT")).toBe("SENT");
    expect(nextMessageOutcome("SENT", null)).toBe("SENT");
  });

  it("lets a failure replace progress unless the message was read", () => {
    expect(nextMessageOutcome("SENT", "BOUNCED")).toBe("BOUNCED");
    expect(nextMessageOutcome("DELIVERED", "FAILED")).toBe("FAILED");
    expect(nextMessageOutcome("READ", "BOUNCED")).toBe("READ");
    expect(nextMessageOutcome("FAILED", "DELIVERED")).toBe("FAILED");
  });
});

describe("automation step allow-list", () => {
  const workflow = (...types: unknown[]) => ({ nodes: types.map((type, index) => ({ id: `n${index}`, data: type === undefined ? {} : { type } })), edges: [] });

  it("accepts every step the builder offers, older names and untyped steps", () => {
    expect(() => assertWorkflowStepsSupported(workflow("trigger", "condition", "send_email", "create_activity", "update_field", "delay", undefined))).not.toThrow();
    expect(() => assertWorkflowStepsSupported({})).not.toThrow();
  });

  it("refuses a step type the CRM doesn't know", () => {
    expect(() => assertWorkflowStepsSupported(workflow("trigger", "send_fax"))).toThrow("AUTOMATION_STEP_UNSUPPORTED");
    expect(() => assertWorkflowStepsSupported(workflow({ evil: true }))).toThrow("AUTOMATION_STEP_UNSUPPORTED");
  });
});

describe("custom field value typing", () => {
  it("stores each type in its column and removes empty values", () => {
    expect(toStoredValue("NUMBER", "42.5")?.valueNumber).toBe(42.5);
    expect(toStoredValue("BOOLEAN", "true")?.valueBoolean).toBe(true);
    expect(toStoredValue("CHECKBOX", false)?.valueBoolean).toBe(false);
    expect(toStoredValue("DATE", "2026-10-27")?.valueDate).toBe("2026-10-27T00:00:00.000Z");
    expect(toStoredValue("MULTI_SELECT", ["a", "b"])?.valueJson).toBe('["a","b"]');
    expect(toStoredValue("DROPDOWN", "MBA")?.valueString).toBe("MBA");
    expect(toStoredValue("TEXT", "")).toBeNull();
    expect(toStoredValue("MULTI_SELECT", [])).toBeNull();
  });

  it("refuses a value of the wrong kind", () => {
    expect(() => toStoredValue("NUMBER", "lots")).toThrow("CUSTOM_FIELD_VALUE_INVALID");
    expect(() => toStoredValue("DATE", "not a date")).toThrow("CUSTOM_FIELD_VALUE_INVALID");
  });
});
