import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { providerSpendBudgetWindow } from "./providerSpendBudgetWindow.ts";

describe("providerSpendBudgetWindow", () => {
  it.each([
    [
      "week",
      "2026-11-11",
      "UTC",
      "2026-11-20T00:00:00Z",
      "2026-11-18T00:00:00Z",
      "2026-11-25T00:00:00Z",
      true,
    ],
    [
      "week",
      "2026-11-11",
      "Asia/Shanghai",
      "2026-11-17T16:00:00Z",
      "2026-11-17T16:00:00Z",
      "2026-11-24T16:00:00Z",
      true,
    ],
    [
      "week",
      "2026-11-11",
      "America/New_York",
      "2026-11-11T04:59:59Z",
      "2026-11-11T05:00:00Z",
      "2026-11-18T05:00:00Z",
      false,
    ],
    [
      "month",
      "2024-01-31",
      "UTC",
      "2024-02-28T23:59:59Z",
      "2024-01-31T00:00:00Z",
      "2024-02-29T00:00:00Z",
      true,
    ],
    [
      "month",
      "2025-01-31",
      "UTC",
      "2025-03-01T00:00:00Z",
      "2025-02-28T00:00:00Z",
      "2025-03-31T00:00:00Z",
      true,
    ],
    [
      "day",
      "2026-03-01",
      "America/New_York",
      "2026-03-08T19:00:00Z",
      "2026-03-08T05:00:00Z",
      "2026-03-09T04:00:00Z",
      true,
    ],
    [
      "day",
      "2026-11-01",
      "America/New_York",
      "2026-11-02T04:30:00Z",
      "2026-11-01T04:00:00Z",
      "2026-11-02T05:00:00Z",
      true,
    ],
  ] as const)(
    "derives the %s window from %s in %s at %s",
    (period, startsAt, timeZone, now, start, end, active) => {
      expect(
        providerSpendBudgetWindow(
          { amountUsd: 125, period, startsAt, timeZone },
          DateTime.makeUnsafe(now),
        ),
      ).toEqual({
        start: DateTime.makeUnsafe(start),
        end: DateTime.makeUnsafe(end),
        active,
      });
    },
  );
});
