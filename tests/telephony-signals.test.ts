import { describe, it, expect } from "vitest";
import { computeTelephonySignals } from "@/lib/server/telephony-signals";

const NOW = new Date("2026-06-15T12:00:00.000Z");

describe("computeTelephonySignals", () => {
  it("returns nulls/zeros for a record with no calls and no dispositions", () => {
    const result = computeTelephonySignals([], [], new Map(), NOW);
    expect(result).toEqual({
      callCount: 0,
      answeredCallCount: 0,
      answeredCallRate: null,
      lastCallOutcome: null,
      callCadenceDays: null,
      missedCallbackCount: 0,
      totalTalkTimeSeconds: 0,
      avgTalkTimeSeconds: null,
      dispositionQualityScore: null,
      lastDispositionOutcome: null,
      preferredContactWindow: null,
      callEngagementScore: null,
    });
  });

  it("computes answeredCallRate and lastCallOutcome from a mix of call statuses", () => {
    const result = computeTelephonySignals(
      [
        { status: "completed", duration: 120, startedAt: "2026-06-01T10:00:00.000Z" },
        { status: "missed", duration: null, startedAt: "2026-06-02T10:00:00.000Z" },
        { status: "completed", duration: 200, startedAt: "2026-06-03T10:00:00.000Z" },
      ],
      [],
      new Map(),
      NOW,
    );
    expect(result.callCount).toBe(3);
    expect(result.answeredCallCount).toBe(2);
    expect(result.answeredCallRate).toBeCloseTo(2 / 3);
    expect(result.lastCallOutcome).toBe("completed");
  });

  it("picks lastCallOutcome from the most recent call regardless of input order", () => {
    const result = computeTelephonySignals(
      [
        { status: "completed", duration: 60, startedAt: "2026-06-05T10:00:00.000Z" },
        { status: "failed", duration: null, startedAt: "2026-06-01T10:00:00.000Z" },
      ],
      [],
      new Map(),
      NOW,
    );
    expect(result.lastCallOutcome).toBe("completed");
  });

  it("computes callCadenceDays as the average gap between consecutive calls", () => {
    const result = computeTelephonySignals(
      [
        { status: "completed", duration: 60, startedAt: "2026-06-01T00:00:00.000Z" },
        { status: "completed", duration: 60, startedAt: "2026-06-03T00:00:00.000Z" },
        { status: "completed", duration: 60, startedAt: "2026-06-05T00:00:00.000Z" },
      ],
      [],
      new Map(),
      NOW,
    );
    expect(result.callCadenceDays).toBe(2);
  });

  it("leaves callCadenceDays null with fewer than two calls", () => {
    const result = computeTelephonySignals([{ status: "completed", duration: 60, startedAt: "2026-06-01T00:00:00.000Z" }], [], new Map(), NOW);
    expect(result.callCadenceDays).toBeNull();
  });

  it("computes talk time only over calls with a recorded duration", () => {
    const result = computeTelephonySignals(
      [
        { status: "completed", duration: 100, startedAt: "2026-06-01T00:00:00.000Z" },
        { status: "completed", duration: null, startedAt: "2026-06-02T00:00:00.000Z" },
        { status: "completed", duration: 200, startedAt: "2026-06-03T00:00:00.000Z" },
      ],
      [],
      new Map(),
      NOW,
    );
    expect(result.totalTalkTimeSeconds).toBe(300);
    expect(result.avgTalkTimeSeconds).toBe(150);
  });

  it("picks the most frequent contact-hour bucket among answered calls as preferredContactWindow", () => {
    // Local time (no "Z" suffix) since the computation reads server-local hours, same
    // established convention as this app's other quiet-hours/working-hours checks.
    const result = computeTelephonySignals(
      [
        { status: "completed", duration: 60, startedAt: "2026-06-01T09:00:00.000" }, // MORNING
        { status: "completed", duration: 60, startedAt: "2026-06-02T10:00:00.000" }, // MORNING
        { status: "completed", duration: 60, startedAt: "2026-06-03T19:00:00.000" }, // EVENING
        { status: "missed", duration: null, startedAt: "2026-06-04T02:00:00.000" }, // not answered -- excluded
      ],
      [],
      new Map(),
      NOW,
    );
    expect(result.preferredContactWindow).toBe("MORNING");
  });

  it("returns null preferredContactWindow when no calls were answered", () => {
    const result = computeTelephonySignals([{ status: "missed", duration: null, startedAt: "2026-06-01T09:00:00.000" }], [], new Map(), NOW);
    expect(result.preferredContactWindow).toBeNull();
  });

  it("scores dispositionQuality from the most recent disposition's interestLevel", () => {
    const result = computeTelephonySignals(
      [{ status: "completed", duration: 60, startedAt: "2026-06-01T00:00:00.000Z" }],
      [
        { interestLevel: "COLD", callbackAt: null, taskId: null, outcomeName: "Not interested", createdAt: "2026-06-01T00:00:00.000Z" },
        { interestLevel: "HOT", callbackAt: null, taskId: null, outcomeName: "Very interested", createdAt: "2026-06-05T00:00:00.000Z" },
      ],
      new Map(),
      NOW,
    );
    expect(result.dispositionQualityScore).toBe(100);
    expect(result.lastDispositionOutcome).toBe("Very interested");
  });

  it("counts a callback as missed when it's overdue and its task isn't completed", () => {
    const result = computeTelephonySignals(
      [{ status: "completed", duration: 60, startedAt: "2026-06-01T00:00:00.000Z" }],
      [{ interestLevel: "WARM", callbackAt: "2026-06-10T00:00:00.000Z", taskId: "task-1", outcomeName: "Callback", createdAt: "2026-06-01T00:00:00.000Z" }],
      new Map([["task-1", { status: "OPEN" }]]),
      NOW,
    );
    expect(result.missedCallbackCount).toBe(1);
  });

  it("does not count a callback as missed once its task is completed", () => {
    const result = computeTelephonySignals(
      [{ status: "completed", duration: 60, startedAt: "2026-06-01T00:00:00.000Z" }],
      [{ interestLevel: "WARM", callbackAt: "2026-06-10T00:00:00.000Z", taskId: "task-1", outcomeName: "Callback", createdAt: "2026-06-01T00:00:00.000Z" }],
      new Map([["task-1", { status: "COMPLETED" }]]),
      NOW,
    );
    expect(result.missedCallbackCount).toBe(0);
  });

  it("does not count a callback as missed while it's still in the future", () => {
    const result = computeTelephonySignals(
      [{ status: "completed", duration: 60, startedAt: "2026-06-01T00:00:00.000Z" }],
      [{ interestLevel: "WARM", callbackAt: "2026-06-20T00:00:00.000Z", taskId: "task-1", outcomeName: "Callback", createdAt: "2026-06-01T00:00:00.000Z" }],
      new Map([["task-1", { status: "OPEN" }]]),
      NOW,
    );
    expect(result.missedCallbackCount).toBe(0);
  });

  it("does not count an overdue callback with no linked task as missed", () => {
    const result = computeTelephonySignals(
      [{ status: "completed", duration: 60, startedAt: "2026-06-01T00:00:00.000Z" }],
      [{ interestLevel: "WARM", callbackAt: "2026-06-10T00:00:00.000Z", taskId: null, outcomeName: "Callback", createdAt: "2026-06-01T00:00:00.000Z" }],
      new Map(),
      NOW,
    );
    expect(result.missedCallbackCount).toBe(0);
  });

  it("computes a higher callEngagementScore for a high answer rate, hot disposition, and no missed callbacks", () => {
    const good = computeTelephonySignals(
      [
        { status: "completed", duration: 300, startedAt: "2026-06-01T00:00:00.000Z" },
        { status: "completed", duration: 300, startedAt: "2026-06-02T00:00:00.000Z" },
      ],
      [{ interestLevel: "HOT", callbackAt: null, taskId: null, outcomeName: "Interested", createdAt: "2026-06-02T00:00:00.000Z" }],
      new Map(),
      NOW,
    );
    const bad = computeTelephonySignals(
      [
        { status: "missed", duration: null, startedAt: "2026-06-01T00:00:00.000Z" },
        { status: "missed", duration: null, startedAt: "2026-06-02T00:00:00.000Z" },
      ],
      [{ interestLevel: "COLD", callbackAt: "2026-06-05T00:00:00.000Z", taskId: "task-1", outcomeName: "Not interested", createdAt: "2026-06-02T00:00:00.000Z" }],
      new Map([["task-1", { status: "OPEN" }]]),
      NOW,
    );
    expect(good.callEngagementScore).toBeGreaterThan(bad.callEngagementScore ?? 0);
    expect(good.callEngagementScore).toBeGreaterThanOrEqual(0);
    expect(good.callEngagementScore).toBeLessThanOrEqual(100);
  });

  it("keeps callEngagementScore within 0-100 bounds even with many missed callbacks", () => {
    const dispositions = Array.from({ length: 10 }, (_, i) => ({
      interestLevel: "COLD",
      callbackAt: "2026-06-01T00:00:00.000Z",
      taskId: `task-${i}`,
      outcomeName: "Not interested",
      createdAt: "2026-06-01T00:00:00.000Z",
    }));
    const tasksById = new Map(dispositions.map((d) => [d.taskId, { status: "OPEN" }]));
    const result = computeTelephonySignals([{ status: "missed", duration: null, startedAt: "2026-06-01T00:00:00.000Z" }], dispositions, tasksById, NOW);
    expect(result.callEngagementScore).toBeGreaterThanOrEqual(0);
  });
});
