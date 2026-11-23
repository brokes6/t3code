import type {
  ProviderInstanceId,
  ProviderSpendBudget,
  ServerProvider,
  ServerProviderUsageWindow,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ServerSettings from "../serverSettings.ts";
import { providerSpendBudgetWindow } from "./providerSpendBudgetWindow.ts";

export class ProviderSpendBudgets extends Context.Service<
  ProviderSpendBudgets,
  {
    readonly addWindows: (
      providers: readonly ServerProvider[],
    ) => Effect.Effect<readonly ServerProvider[]>;
    readonly turnSettled: (instanceId: ProviderInstanceId) => Effect.Effect<void>;
    readonly subscribeChanges: Effect.Effect<Stream.Stream<void>, never, Scope.Scope>;
  }
>()("t3/usage/ProviderSpendBudgets") {}

const labels = { day: "Daily budget", week: "Weekly budget", month: "Monthly budget" } as const;

type BudgetEntry = {
  readonly budget: ProviderSpendBudget;
  readonly refreshAt: number;
  readonly window: ServerProviderUsageWindow | undefined;
};

const make = Effect.gen(function* () {
  const settings = yield* ServerSettings.ServerSettingsService;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const settingsChanges = yield* settings.subscribeChanges;
  const refreshes = yield* Queue.unbounded<ProviderInstanceId | null>();
  const updates = yield* PubSub.unbounded<void>();
  const state = yield* Ref.make(new Map<ProviderInstanceId, BudgetEntry>());

  const measure = Effect.fn("ProviderSpendBudgets.measure")(function* (
    instanceId: ProviderInstanceId,
    budget: ProviderSpendBudget,
    now: DateTime.Utc,
  ) {
    const { start, end, active } = providerSpendBudgetWindow(budget, now);
    const used = active ? yield* projections.readProviderTurnSpend(instanceId, start, end) : 0;
    const usedUsd = Math.min(Number.MAX_VALUE, Math.max(0, used));
    const refreshAt = DateTime.toEpochMillis(active ? end : start);
    const window: ServerProviderUsageWindow = {
      id: "budget",
      label: labels[budget.period],
      kind: budget.period === "week" ? "weekly" : budget.period === "month" ? "monthly" : "other",
      usedPercent: Math.min(100, (usedUsd / budget.amountUsd) * 100),
      resetsAt: DateTime.formatIso(end),
      windowDurationMins: Math.round(
        (DateTime.toEpochMillis(end) - DateTime.toEpochMillis(start)) / 60_000,
      ),
      spend: {
        usedUsd,
        limitUsd: budget.amountUsd,
        ...(!active ? { startsAt: DateTime.formatIso(start) } : {}),
      },
    };
    return { budget, refreshAt, window };
  });

  const refresh = Effect.fn("ProviderSpendBudgets.refresh")(function* (
    instanceId: ProviderInstanceId | null,
    force: boolean,
  ) {
    const { providerInstances } = yield* settings.getSettings;
    const previous = yield* Ref.get(state);
    const now = yield* DateTime.now;
    const nowMs = DateTime.toEpochMillis(now);
    const next = new Map<ProviderInstanceId, BudgetEntry>();
    for (const [id, { spendBudget }] of Object.entries(providerInstances)) {
      if (spendBudget === undefined) continue;
      const key = id as ProviderInstanceId;
      const existing = previous.get(key);
      const same = existing !== undefined && Equal.equals(spendBudget, existing.budget);
      const entry =
        same && !force && existing.refreshAt > nowMs && instanceId !== key
          ? existing
          : yield* measure(key, spendBudget, now).pipe(
              Effect.catch((error) =>
                Effect.logWarning(error.message, error).pipe(
                  Effect.as({
                    budget: spendBudget,
                    refreshAt: nowMs + 60_000,
                    window: same ? existing.window : undefined,
                  }),
                ),
              ),
            );
      next.set(key, entry);
    }
    yield* Ref.set(state, next);
    if (
      next.size !== previous.size ||
      [...next].some(([key, entry]) => !Equal.equals(entry.window, previous.get(key)?.window))
    ) {
      yield* PubSub.publish(updates, undefined);
    }
  });

  const refreshSafely = (instanceId: ProviderInstanceId | null, force = false) =>
    refresh(instanceId, force).pipe(
      Effect.as(true),
      Effect.catch((error) => Effect.logWarning(error.message, error).pipe(Effect.as(false))),
    );
  let settingsFailed = !(yield* refreshSafely(null));
  yield* settingsChanges.pipe(
    Stream.runForEach(() => Queue.offer(refreshes, null)),
    Effect.forkScoped,
  );
  yield* Effect.forever(
    Effect.gen(function* () {
      const entries = yield* Ref.get(state);
      const now = yield* DateTime.now;
      const nowMs = DateTime.toEpochMillis(now);
      const nextAt = settingsFailed
        ? nowMs + 60_000
        : Math.min(...[...entries.values()].map((entry) => entry.refreshAt));
      const signal = Number.isFinite(nextAt)
        ? yield* Queue.take(refreshes).pipe(
            Effect.timeoutOrElse({
              // The host timer cannot schedule a whole 31-day month at once.
              duration: Math.max(0, Math.min(86_400_000, nextAt - nowMs)),
              orElse: () => Effect.succeed(null),
            }),
          )
        : yield* Queue.take(refreshes);
      settingsFailed = !(yield* refreshSafely(signal, settingsFailed));
    }),
  ).pipe(Effect.forkScoped);

  const addWindows = Effect.fn("ProviderSpendBudgets.addWindows")(function* (
    providers: readonly ServerProvider[],
  ) {
    const entries = yield* Ref.get(state);
    if (entries.size === 0) return providers;
    return providers.map((provider) => {
      const window = entries.get(provider.instanceId)?.window;
      if (window === undefined) return provider;
      const limits = provider.usageLimits ?? {
        checkedAt: provider.checkedAt,
        windows: [],
      };
      const { unavailable, ...official } = limits;
      return {
        ...provider,
        usageLimits: {
          ...official,
          ...(unavailable !== undefined && official.windows.length > 0 ? { unavailable } : {}),
          windows: [...official.windows, window],
        },
      };
    });
  });

  const turnSettled = Effect.fn("ProviderSpendBudgets.turnSettled")(function* (
    id: ProviderInstanceId,
  ) {
    if ((yield* Ref.get(state)).has(id)) yield* Queue.offer(refreshes, id);
  });

  return ProviderSpendBudgets.of({
    addWindows,
    turnSettled,
    subscribeChanges: PubSub.subscribe(updates).pipe(Effect.map(Stream.fromSubscription)),
  });
});

export const layer = Layer.effect(ProviderSpendBudgets, make);
