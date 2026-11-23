import type { ProviderSpendBudget } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

export function providerSpendBudgetWindow(budget: ProviderSpendBudget, now: DateTime.Utc) {
  const zone = DateTime.zoneMakeNamedUnsafe(budget.timeZone);
  const anchor = DateTime.makeUnsafe(budget.startsAt);
  const localToday = DateTime.removeTime(DateTime.setZone(now, zone));
  const atMidnight = (date: DateTime.Utc) =>
    DateTime.makeZonedUnsafe(date, { timeZone: zone, adjustForTimeZone: true });
  const start = atMidnight(anchor);
  const nowMs = DateTime.toEpochMillis(now);
  const active = nowMs >= DateTime.toEpochMillis(start);
  const step = budget.period === "week" ? 7 : 1;
  const boundary = (index: number) =>
    atMidnight(
      DateTime.add(anchor, budget.period === "month" ? { months: index } : { days: index * step }),
    );
  if (!active) return { start: DateTime.toUtc(start), end: DateTime.toUtc(boundary(1)), active };

  const anchorParts = DateTime.toParts(anchor);
  const todayParts = DateTime.toParts(localToday);
  const offset =
    budget.period === "month"
      ? (todayParts.year - anchorParts.year) * 12 + todayParts.month - anchorParts.month
      : Math.floor(
          (DateTime.toEpochMillis(localToday) - DateTime.toEpochMillis(anchor)) /
            (86_400_000 * step),
        );
  const index = DateTime.toEpochMillis(boundary(offset)) > nowMs ? offset - 1 : offset;
  return {
    start: DateTime.toUtc(boundary(index)),
    end: DateTime.toUtc(boundary(index + 1)),
    active,
  };
}
