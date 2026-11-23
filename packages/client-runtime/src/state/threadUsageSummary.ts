import type {
  OrchestrationV2ProviderThread,
  OrchestrationV2ProviderTurn,
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
) {
  let totalCostUsd: number | null = null;
  let hasUnpricedTurns = false;
  let hasUntrackedTurns = false;
  const costByModel = new Map<string | null, number>();
  const unpricedModels = new Set<string>();
  let lastTurn: OrchestrationV2ProviderTurn | null = null;
  let lastTurnAt = -Infinity;

  for (const turn of turns) {
    const usage = turn.turnTokenUsage;
    if (turn.status === "pending" || turn.status === "running" || usage?.localCommand) continue;
    const model = turn.model ?? usage?.models?.[0] ?? null;
    const cost = turnCost(turn);
    if (cost === null) {
      // Turns settled before per-turn pricing existed carry no costSource at all.
      if (turn.costSource === undefined && usage?.usageStatus === "complete") {
        hasUntrackedTurns = true;
      } else if (turn.startedAt !== null || usage !== undefined) {
        hasUnpricedTurns = true;
      }
      if (model !== null && turn.costSource === "unpriced" && usage?.usageStatus === "complete") {
        unpricedModels.add(model);
      }
    } else {
      totalCostUsd = (totalCostUsd ?? 0) + cost;
      costByModel.set(model, (costByModel.get(model) ?? 0) + cost);
    }

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

  return {
    totalCostUsd,
    costByModel: [...costByModel]
      .map(([model, costUsd]) => ({ model, costUsd }))
      .sort((a, b) => b.costUsd - a.costUsd),
    hasUnpricedTurns,
    hasUntrackedTurns,
    unpricedModels: [...unpricedModels].sort(),
    lastTurn: lastTurn === null ? null : deriveLastTurn(lastTurn),
  };
}
