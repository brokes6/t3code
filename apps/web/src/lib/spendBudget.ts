import type { ServerProviderUsageWindow } from "@t3tools/contracts";
import { formatUsd } from "@t3tools/shared/usageFormat";
import { formatDuration } from "@t3tools/shared/usageLimitsCopy";
import { msg } from "gt-react";

import type { MessageResolver } from "../i18n/messages";

export function spendBudgetLabel(window: ServerProviderUsageWindow, m: MessageResolver): string {
  if (window.spend === undefined) return window.label;
  if (window.kind === "weekly") return m(msg("Weekly budget"));
  if (window.kind === "monthly") return m(msg("Monthly budget"));
  return m(msg("Daily budget"));
}

export function spendBudgetDetails(
  window: ServerProviderUsageWindow,
  locale: string,
  m: MessageResolver,
  now: number,
) {
  if (window.spend === undefined) return null;
  const { usedUsd, limitUsd, startsAt } = window.spend;
  const balance = limitUsd - usedUsd;
  const over = balance < 0;
  const amount = formatUsd(Math.abs(balance), locale);
  const untilStart = startsAt === undefined ? 0 : Date.parse(startsAt) - now;
  return {
    over,
    label: over
      ? m(msg("{amount} over budget", { amount }))
      : m(msg("{amount} left of {limit}", { amount, limit: formatUsd(limitUsd, locale) })),
    startsIn:
      untilStart > 0
        ? m(msg("Starts in {duration}", { duration: formatDuration(untilStart, m) }))
        : null,
  };
}
