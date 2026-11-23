import { assert, it } from "@effect/vitest";
import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  type ServerSettings as ServerSettingsValue,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as ProviderSpendBudgets from "./ProviderSpendBudgets.ts";

const instanceId = ProviderInstanceId.make("custom");
const driver = ProviderDriverKind.make("claudeAgent");
const checkedAt = "2026-11-10T23:59:00.000Z";
const provider: ServerProvider = {
  instanceId,
  driver,
  checkedAt,
  enabled: true,
  installed: true,
  status: "ready",
  version: null,
  auth: { status: "authenticated" },
  models: [],
  slashCommands: [],
  skills: [],
  usageLimits: { checkedAt, windows: [], unavailable: { reason: "unsupported" } },
};

it.effect("publishes budget settings, priced turns, window resets, and clearing", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe(checkedAt)));
    const settings = yield* Ref.make(DEFAULT_SERVER_SETTINGS);
    const settingsChanges = yield* PubSub.unbounded<ServerSettingsValue>();
    const amount = yield* Ref.make(30);
    const layerSettings = Layer.mock(ServerSettings.ServerSettingsService)({
      getSettings: Ref.get(settings),
      subscribeChanges: PubSub.subscribe(settingsChanges).pipe(Effect.map(Stream.fromSubscription)),
    });
    const layerProjections = Layer.mock(ProjectionStore.ProjectionStoreV2)({
      readProviderTurnSpend: (id, start) => {
        assert.equal(id, instanceId);
        return DateTime.formatIsoDate(start) === "2026-11-11" ? Ref.get(amount) : Effect.succeed(0);
      },
    });
    yield* Effect.gen(function* () {
      const service = yield* ProviderSpendBudgets.ProviderSpendBudgets;
      const changes = yield* service.subscribeChanges;
      const updates = yield* Stream.toQueue(changes, { capacity: 1 });
      const read = service.addWindows([provider]).pipe(Effect.map(([entry]) => entry?.usageLimits));
      const write = (next: ServerSettingsValue) =>
        Ref.set(settings, next).pipe(Effect.andThen(PubSub.publish(settingsChanges, next)));

      yield* write({
        ...DEFAULT_SERVER_SETTINGS,
        providerInstances: {
          [instanceId]: {
            driver,
            spendBudget: {
              amountUsd: 125,
              period: "week",
              startsAt: "2026-11-11",
              timeZone: "UTC",
            },
          },
        },
      });
      yield* Queue.take(updates);
      const future = yield* read;
      assert.isUndefined(future?.unavailable);
      assert.deepInclude(future?.windows[0]?.spend, {
        usedUsd: 0,
        startsAt: "2026-11-11T00:00:00.000Z",
      });

      yield* TestClock.adjust("1 minute");
      yield* Queue.take(updates);
      assert.deepEqual((yield* read)?.windows[0]?.spend, { usedUsd: 30, limitUsd: 125 });
      yield* Ref.set(amount, 140);
      yield* service.turnSettled(instanceId);
      yield* Queue.take(updates);
      const over = (yield* read)?.windows[0];
      assert.equal(over?.usedPercent, 100);
      assert.equal(over?.spend?.usedUsd, 140);

      yield* TestClock.adjust("7 days");
      yield* Queue.take(updates);
      const reset = (yield* read)?.windows[0];
      assert.equal(reset?.usedPercent, 0);
      assert.equal(reset?.resetsAt, "2026-11-25T00:00:00.000Z");

      yield* write(DEFAULT_SERVER_SETTINGS);
      yield* Queue.take(updates);
      assert.deepEqual(yield* read, provider.usageLimits);
    }).pipe(
      Effect.provide(
        ProviderSpendBudgets.layer.pipe(
          Layer.provide(Layer.merge(layerSettings, layerProjections)),
        ),
      ),
    );
  }),
);
