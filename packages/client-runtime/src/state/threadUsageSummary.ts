import type {
  OrchestrationV2ProviderThread,
  OrchestrationV2ProviderTurn,
  OrchestrationV2RunAttempt,
  RunId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

function turnCost(turn: OrchestrationV2ProviderTurn): number | null {
  return turn.costUsd !== undefined && Number.isFinite(turn.costUsd) ? turn.costUsd : null;
}

function deriveLastTurn(turn: OrchestrationV2ProviderTurn) {
  const usage = turn.turnTokenUsage;
  const durationMs =
    turn.startedAt !== null && turn.completedAt !== null
      ? Math.max(
          0,
          DateTime.toEpochMillis(turn.completedAt) - DateTime.toEpochMillis(turn.startedAt),
        )
      : null;
  const inputTokens = usage?.inputTokens ?? null;
  const outputTokens = usage?.outputTokens ?? null;
  const cacheReadTokens = usage?.cachedInputTokens ?? null;
  return {
    model: turn.model ?? usage?.models?.[0] ?? null,
    costUsd: turnCost(turn),
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens: usage?.cacheCreationTokens ?? null,
    cacheHitPercent:
      inputTokens !== null && inputTokens > 0 && cacheReadTokens !== null
        ? (Math.min(cacheReadTokens, inputTokens) / inputTokens) * 100
        : null,
    durationMs,
    outputTokensPerSecond:
      outputTokens !== null && durationMs !== null && durationMs > 0
        ? (outputTokens * 1_000) / durationMs
        : null,
  };
}

export function deriveThreadUsageSummary(
  turns: readonly OrchestrationV2ProviderTurn[],
  activeProviderThread?: Pick<OrchestrationV2ProviderThread, "id"> | null,
  workers?: {
    readonly attempts: readonly OrchestrationV2RunAttempt[];
    readonly groups: readonly {
      parentRunId: RunId | null;
      turns: readonly OrchestrationV2ProviderTurn[];
      remote?: boolean;
    }[];
  },
) {
  let totalCostUsd: number | null = null;
  let hasUnpricedTurns = false;
  let hasUntrackedTurns = false;
  const costByModel = new Map<string | null, number>();
  const unpricedModels = new Set<string>();
  let lastTurn: OrchestrationV2ProviderTurn | null = null;
  let lastTurnAt = -Infinity;

  const includeCost = (turn: OrchestrationV2ProviderTurn, offerPriceOverride = true) => {
    const usage = turn.turnTokenUsage;
    if (turn.status === "pending" || turn.status === "running" || usage?.localCommand)
      return undefined;
    const model = turn.model ?? usage?.models?.[0] ?? null;
    const cost = turnCost(turn);
    if (cost === null) {
      // Turns settled before per-turn pricing existed carry no costSource at all.
      if (turn.costSource === undefined && usage?.usageStatus === "complete") {
        hasUntrackedTurns = true;
      } else if (turn.startedAt !== null || usage !== undefined) {
        hasUnpricedTurns = true;
      }
      if (
        offerPriceOverride &&
        model !== null &&
        turn.costSource === "unpriced" &&
        usage?.usageStatus === "complete"
      ) {
        unpricedModels.add(model);
      }
    } else {
      totalCostUsd = (totalCostUsd ?? 0) + cost;
      costByModel.set(model, (costByModel.get(model) ?? 0) + cost);
    }

    return cost;
  };

  for (const turn of turns) {
    const cost = includeCost(turn);
    if (cost === undefined) continue;
    const usage = turn.turnTokenUsage;
    if (
      (activeProviderThread != null && activeProviderThread.id !== turn.providerThreadId) ||
      (cost === null && (usage === undefined || usage.usageStatus === "unavailable"))
    )
      continue;
    const timestamp = turn.completedAt ?? turn.startedAt;
    const at = timestamp === null ? -Infinity : DateTime.toEpochMillis(timestamp);
    if (at >= lastTurnAt) {
      lastTurnAt = at;
      lastTurn = turn;
    }
  }

  const lastRunId =
    lastTurn === null
      ? undefined
      : workers?.attempts.find(
          (attempt) =>
            attempt.providerTurnId === lastTurn?.id || attempt.id === lastTurn?.runAttemptId,
        )?.runId;
  let lastWorkerCost: number | null = null;
  for (const group of workers?.groups ?? []) {
    for (const turn of group.turns) {
      const cost = includeCost(turn, !group.remote);
      if (cost != null && lastRunId !== undefined && group.parentRunId === lastRunId) {
        lastWorkerCost = (lastWorkerCost ?? 0) + cost;
      }
    }
  }
  const last = lastTurn === null ? null : deriveLastTurn(lastTurn);

  return {
    totalCostUsd,
    costByModel: [...costByModel]
      .map(([model, costUsd]) => ({ model, costUsd }))
      .sort((a, b) => b.costUsd - a.costUsd),
    hasUnpricedTurns,
    hasUntrackedTurns,
    unpricedModels: [...unpricedModels].sort(),
    lastTurn:
      last === null || lastWorkerCost === null
        ? last
        : { ...last, costUsd: (last.costUsd ?? 0) + lastWorkerCost, workerCostUsd: lastWorkerCost },
  };
}
