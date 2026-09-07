// Pure, DB-free computation of telephony-derived signals for predictive scoring and
// next-best-action ranking -- kept deliberately free of any query/DB dependency so both
// self-learning-scoring.ts and any future caller can compute these from already-fetched rows
// without a mocking-heavy test setup. Callers are responsible for fetching TelephonyCallLog/
// CallDisposition/Task rows and grouping them per Lead/Opportunity before calling this.

export type TelephonyCallSignal = {
  status: string | null;
  duration: number | null;
  startedAt: string;
};

export type TelephonyDispositionSignal = {
  interestLevel: string | null;
  callbackAt: string | null;
  taskId: string | null;
  outcomeName: string | null;
  createdAt: string;
};

export type ContactWindow = "MORNING" | "AFTERNOON" | "EVENING" | "NIGHT";

export type TelephonySignals = {
  callCount: number;
  answeredCallCount: number;
  answeredCallRate: number | null;
  lastCallOutcome: string | null;
  callCadenceDays: number | null;
  missedCallbackCount: number;
  totalTalkTimeSeconds: number;
  avgTalkTimeSeconds: number | null;
  dispositionQualityScore: number | null;
  lastDispositionOutcome: string | null;
  preferredContactWindow: ContactWindow | null;
  callEngagementScore: number | null;
};

const ANSWERED_STATUSES = new Set(["completed"]);
const INTEREST_LEVEL_SCORE: Record<string, number> = { HOT: 100, WARM: 50, COLD: 0 };

function contactWindowForHour(hour: number): ContactWindow {
  if (hour >= 5 && hour < 12) return "MORNING";
  if (hour >= 12 && hour < 17) return "AFTERNOON";
  if (hour >= 17 && hour < 21) return "EVENING";
  return "NIGHT";
}

function mostFrequent<T extends string>(values: T[]): T | null {
  if (!values.length) return null;
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

// A call is only counted as "missed" if its callback is both due and unresolved -- resolved
// means either the callback's own linked Task was completed, or (when no Task was linked at
// all -- e.g. logged before the callback-scheduler pass existed) it's simply not counted
// against the record, since there's nothing to check completion against.
function countMissedCallbacks(dispositions: TelephonyDispositionSignal[], tasksById: Map<string, { status?: string | null }>, now: Date) {
  return dispositions.filter((disposition) => {
    if (!disposition.callbackAt) return false;
    if (new Date(disposition.callbackAt).getTime() >= now.getTime()) return false;
    if (!disposition.taskId) return false;
    const task = tasksById.get(disposition.taskId);
    return String(task?.status ?? "").toUpperCase() !== "COMPLETED";
  }).length;
}

export function computeTelephonySignals(
  calls: TelephonyCallSignal[],
  dispositions: TelephonyDispositionSignal[],
  tasksById: Map<string, { status?: string | null }>,
  now: Date = new Date(),
): TelephonySignals {
  const callCount = calls.length;
  if (callCount === 0) {
    return {
      callCount: 0,
      answeredCallCount: 0,
      answeredCallRate: null,
      lastCallOutcome: null,
      callCadenceDays: null,
      missedCallbackCount: countMissedCallbacks(dispositions, tasksById, now),
      totalTalkTimeSeconds: 0,
      avgTalkTimeSeconds: null,
      dispositionQualityScore: dispositionQualityFor(dispositions),
      lastDispositionOutcome: lastDispositionOutcomeFor(dispositions),
      preferredContactWindow: null,
      callEngagementScore: null,
    };
  }

  const sorted = [...calls].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  const answered = sorted.filter((call) => ANSWERED_STATUSES.has(String(call.status)));
  const answeredCallCount = answered.length;
  const answeredCallRate = answeredCallCount / callCount;
  const lastCallOutcome = sorted[sorted.length - 1].status ?? null;

  let callCadenceDays: number | null = null;
  if (sorted.length >= 2) {
    const spanMs = new Date(sorted[sorted.length - 1].startedAt).getTime() - new Date(sorted[0].startedAt).getTime();
    callCadenceDays = Math.round((spanMs / (sorted.length - 1) / (24 * 60 * 60 * 1000)) * 100) / 100;
  }

  const durations = sorted.map((call) => call.duration).filter((duration): duration is number => duration != null);
  const totalTalkTimeSeconds = durations.reduce((sum, duration) => sum + duration, 0);
  const avgTalkTimeSeconds = durations.length ? Math.round((totalTalkTimeSeconds / durations.length) * 100) / 100 : null;

  const preferredContactWindow = mostFrequent(answered.map((call) => contactWindowForHour(new Date(call.startedAt).getHours())));
  const missedCallbackCount = countMissedCallbacks(dispositions, tasksById, now);
  const dispositionQualityScore = dispositionQualityFor(dispositions);
  const lastDispositionOutcome = lastDispositionOutcomeFor(dispositions);

  // A composite 0-100 telephony engagement signal, deliberately separate from the generic
  // engagementScore -- weighted toward answer rate and disposition quality (both direct
  // signals of a real, positive conversation happening), talk time as a lighter secondary
  // signal, and missed callbacks as a capped penalty.
  const callEngagementScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        answeredCallRate * 45 +
          (dispositionQualityScore ?? 50) * 0.35 +
          Math.min(avgTalkTimeSeconds ?? 0, 300) / 300 * 20 -
          Math.min(missedCallbackCount, 5) * 8,
      ),
    ),
  );

  return {
    callCount,
    answeredCallCount,
    answeredCallRate,
    lastCallOutcome,
    callCadenceDays,
    missedCallbackCount,
    totalTalkTimeSeconds,
    avgTalkTimeSeconds,
    dispositionQualityScore,
    lastDispositionOutcome,
    preferredContactWindow,
    callEngagementScore,
  };
}

function dispositionQualityFor(dispositions: TelephonyDispositionSignal[]): number | null {
  if (!dispositions.length) return null;
  const latest = [...dispositions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const level = latest.interestLevel ? INTEREST_LEVEL_SCORE[String(latest.interestLevel).toUpperCase()] : undefined;
  return level ?? null;
}

function lastDispositionOutcomeFor(dispositions: TelephonyDispositionSignal[]): string | null {
  if (!dispositions.length) return null;
  const latest = [...dispositions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  return latest.outcomeName ?? null;
}
