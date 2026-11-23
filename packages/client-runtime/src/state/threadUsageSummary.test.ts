import {
  NodeId,
  ProviderInstanceId,
  ProviderThreadId,
  ProviderTurnId,
  RunAttemptId,
  RunId,
  type OrchestrationV2ProviderTurn,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { deriveThreadUsageSummary } from "./threadUsageSummary.ts";

const firstProvider = ProviderThreadId.make("provider:one");
const turnProvider = ProviderInstanceId.make("codex");
const secondProvider = ProviderThreadId.make("provider:two");
const start = DateTime.makeUnsafe(1_000);
const end = DateTime.makeUnsafe(3_000);

const turn: OrchestrationV2ProviderTurn = {
  id: ProviderTurnId.make("turn:one"),
  providerThreadId: firstProvider,
  nodeId: NodeId.make("node:one"),
  runAttemptId: null,
  nativeTurnRef: null,
  ordinal: 1,
  status: "completed",
  startedAt: start,
  completedAt: end,
  model: "first",
  turnTokenUsage: {
    usageStatus: "complete",
    usageScope: "main_agent",
    inputTokens: 100,
    cachedInputTokens: 40,
    cacheCreationTokens: 10,
    outputTokens: 70,
    hasSubagents: false,
  },
  costUsd: 1.25,
  costSource: "modelPriced",
};

describe("deriveThreadUsageSummary", () => {
  it("adds worker costs to the parent run without replacing the last main turn", () => {
    const runId = RunId.make("run:last");
    const summary = deriveThreadUsageSummary(
      [turn],
      { id: firstProvider },
      {
        attempts: [
          {
            id: RunAttemptId.make("attempt:last"),
            runId,
            attemptOrdinal: 1,
            rootNodeId: turn.nodeId,
            providerInstanceId: turnProvider,
            providerThreadId: firstProvider,
            providerTurnId: turn.id,
            reason: "initial",
            status: "completed",
            startedAt: start,
            completedAt: end,
          },
        ],
        groups: [
          {
            parentRunId: runId,
            turns: [
              { ...turn, id: ProviderTurnId.make("worker:last"), model: "worker", costUsd: 0.75 },
              { ...turn, id: ProviderTurnId.make("worker:running"), status: "running" },
            ],
          },
          {
            parentRunId: RunId.make("run:earlier"),
            turns: [{ ...turn, id: ProviderTurnId.make("worker:earlier"), model: "worker" }],
          },
          {
            parentRunId: runId,
            remote: true,
            turns: [
              {
                ...turn,
                id: ProviderTurnId.make("worker:remote-unpriced"),
                model: "worker-remote",
                costUsd: undefined,
                costSource: "unpriced",
              },
            ],
          },
        ],
      },
    );
    expect(summary.totalCostUsd).toBe(3.25);
    expect(summary.costByModel).toContainEqual({ model: "worker", costUsd: 2 });
    expect(summary.hasUnpricedTurns).toBe(true);
    expect(summary.unpricedModels).toEqual([]);
    expect(summary.lastTurn).toMatchObject({
      model: "first",
      costUsd: 2,
      workerCostUsd: 0.75,
      inputTokens: 100,
    });
  });

  it("sums costs across provider threads and takes last-turn details from the active one", () => {
    const summary = deriveThreadUsageSummary(
      [
        {
          ...turn,
          id: ProviderTurnId.make("turn:two"),
          completedAt: DateTime.makeUnsafe(5_000),
          providerThreadId: secondProvider,
          model: "second",
          costUsd: 0,
        },
        turn,
        { ...turn, id: ProviderTurnId.make("turn:three"), completedAt: start, costUsd: 2.25 },
      ],
      { id: firstProvider },
    );
    expect(summary).toEqual({
      totalCostUsd: 3.5,
      costByModel: [
        { model: "first", costUsd: 3.5 },
        { model: "second", costUsd: 0 },
      ],
      hasUnpricedTurns: false,
      hasUntrackedTurns: false,
      unpricedModels: [],
      lastTurn: {
        model: "first",
        costUsd: 1.25,
        inputTokens: 100,
        outputTokens: 70,
        cacheReadTokens: 40,
        cacheWriteTokens: 10,
        cacheHitPercent: 40,
        durationMs: 2_000,
        outputTokensPerSecond: 35,
      },
    });
  });

  it("distinguishes unavailable prices from zero-cost turns and skips unfinished and local turns", () => {
    const { costUsd: _cost, costSource: _source, ...unpriced } = turn;
    const summary = deriveThreadUsageSummary([
      { ...unpriced, model: "custom", costSource: "unpriced", completedAt: start },
      { ...turn, status: "running" },
      { ...turn, turnTokenUsage: { ...turn.turnTokenUsage!, localCommand: true } },
    ]);
    expect(summary.totalCostUsd).toBeNull();
    expect(summary.hasUnpricedTurns).toBe(true);
    expect(summary.unpricedModels).toEqual(["custom"]);
    expect(summary.hasUntrackedTurns).toBe(false);
    const untracked = deriveThreadUsageSummary([unpriced]);
    expect(untracked).toMatchObject({ hasUntrackedTurns: true, hasUnpricedTurns: false });
    expect(summary.lastTurn).toMatchObject({ durationMs: 0, outputTokensPerSecond: null });
    expect(deriveThreadUsageSummary([]).hasUnpricedTurns).toBe(false);
  });
});
