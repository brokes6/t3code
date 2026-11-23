import type {
  ProviderInstanceId,
  ServerProvider,
  ServerProviderUsageLimits,
  ServerProviderUsageWindow,
  UsageLimitSourceSnapshots,
} from "@t3tools/contracts";
import { type LimitPace, type LimitPoolWindow, paceOf } from "@t3tools/shared/usageLimits";
import { formatDuration, limitsNotice } from "@t3tools/shared/usageLimitsCopy";
import { Link } from "@tanstack/react-router";
import { msg, useGT, useLocale, useMessages } from "gt-react";
import type { ReactNode } from "react";

import { usePrimarySettings } from "../../hooks/useSettings";
import { useNowMinute } from "../../hooks/useNowMinute";
import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import { contextWindowDisplay, formatContextWindowTokens } from "../../lib/contextWindow";
import { cn } from "../../lib/utils";
import { spendBudgetDetails, spendBudgetLabel } from "../../lib/spendBudget";
import { formatUpcomingTimestamp } from "../../timestampFormat";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { limitTone, UsageBar, type UsageTone } from "../usage/UsageBar";
import { formatContextWindowCompactionMessage } from "./compaction.logic";
import { ThreadDetailsSection } from "./ThreadDetailsSection";
import {
  poolSources,
  resolveThreadDetailsLimits,
  usageWindowDisplay,
} from "./ThreadDetailsUsage.logic";

const PACE_LABEL: Record<LimitPace, string> = {
  ahead: msg("Ahead of pace"),
  on: msg("On pace"),
  under: msg("Under pace"),
};

export interface ThreadDetailsUsageInput {
  readonly providerInstanceId: ProviderInstanceId | null;
  readonly model: string | null;
  readonly providers: readonly ServerProvider[];
  readonly sources: UsageLimitSourceSnapshots;
  readonly contextWindow: ContextWindowSnapshot | null;
}

/** The selected provider's limit windows. Each row reads as room left and opens the usage page. */
export function ThreadDetailsUsage({
  providerInstanceId,
  model,
  providers,
  sources,
}: Omit<ThreadDetailsUsageInput, "contextWindow">) {
  const gt = useGT();
  const nowMinute = useNowMinute();
  const now = Date.parse(`${nowMinute}:00Z`);
  const resolved = resolveThreadDetailsLimits(providerInstanceId, model, providers, sources, now);
  if (!resolved) return null;

  return (
    <ThreadDetailsSection
      headingId="thread-details-usage-heading"
      title={gt("Usage limits")}
      showHeading={false}
    >
      <div className="grid grid-cols-[auto_minmax(3rem,1fr)_auto] gap-x-3 text-xs">
        {resolved.kind === "pool" ? (
          resolved.windows.map((window) => <PoolRow key={window.id} window={window} now={now} />)
        ) : (
          <InstanceRows
            limits={resolved.limits}
            now={now}
            hasBudget={resolved.budget !== undefined}
          />
        )}
        {resolved.budget ? <LimitRow window={resolved.budget} now={now} /> : null}
      </div>
    </ThreadDetailsSection>
  );
}

function InstanceRows({
  limits,
  now,
  hasBudget,
}: {
  readonly limits: ServerProviderUsageLimits;
  readonly now: number;
  readonly hasBudget: boolean;
}) {
  const gt = useGT();
  const m = useMessages();
  const notice = limitsNotice(limits, m);
  if (notice) {
    if (hasBudget && limits.windows.length === 0) return null;
    return (
      <UsageRow
        label={gt("Limits", { $context: "usage limits row label" })}
        fill={null}
        tone={null}
        value={gt("Unavailable")}
        tooltip={<span className="text-foreground">{notice}</span>}
        opensUsage
      />
    );
  }
  return limits.windows.map((window) => <LimitRow key={window.id} window={window} now={now} />);
}

/** The thread's context window. The bar fills as context is used; the tick marks auto-compaction. */
export function ThreadDetailsContext({ usage }: { readonly usage: ContextWindowSnapshot }) {
  const { maxTokens, used, threshold, tick, tone } = contextWindowDisplay(usage);
  const gt = useGT();
  const m = useMessages();
  const locale = useLocale();
  const usedTokens = formatContextWindowTokens(usage.usedTokens);
  return (
    <ThreadDetailsSection
      headingId="thread-details-context-heading"
      title={gt("Context window")}
      showHeading={false}
    >
      <div className="grid grid-cols-[auto_minmax(3rem,1fr)_auto] gap-x-3 text-xs">
        <UsageRow
          label={gt("Context", { $context: "context window row label" })}
          fill={used}
          tone={tone}
          tick={tick}
          muted
          value={
            maxTokens !== null
              ? `${usedTokens} / ${formatContextWindowTokens(maxTokens)}`
              : usedTokens
          }
          ariaValue={
            used !== null
              ? gt("{used}% used", { used })
              : gt("{usedTokens} tokens used", { usedTokens })
          }
          tooltip={
            <>
              <span className="text-foreground">
                {used !== null
                  ? gt("Context: {used}% used", { used })
                  : gt("Context: {usedTokens} tokens used", { usedTokens })}
              </span>
              {maxTokens !== null ? (
                <span className="text-muted-foreground">
                  {gt("{used} of {max} tokens", {
                    used: usage.usedTokens.toLocaleString(locale),
                    max: maxTokens.toLocaleString(locale),
                  })}
                </span>
              ) : null}
              {threshold !== null && threshold > 0 ? (
                <span className="text-muted-foreground">
                  {formatContextWindowCompactionMessage(threshold, m)}
                </span>
              ) : null}
            </>
          }
        />
      </div>
    </ThreadDetailsSection>
  );
}

function LimitRow({
  window,
  now,
}: {
  readonly window: ServerProviderUsageWindow;
  readonly now: number;
}) {
  const gt = useGT();
  const m = useMessages();
  const locale = useLocale();
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const { left, tick: timeLeft, resetsAt: resetAt } = usageWindowDisplay(window, now);
  const budget = spendBudgetDetails(window, locale, m, now);
  const label = spendBudgetLabel(window, m);
  const pace = paceOf(window, now);
  const resetsAt = resetAt ? Date.parse(resetAt) : Number.NaN;
  return (
    <UsageRow
      label={label}
      fill={left}
      tone={budget?.over ? "error" : limitTone(left)}
      tick={timeLeft}
      value={`${left}%`}
      ariaValue={budget?.label ?? gt("{left}% left", { left })}
      opensUsage
      tooltip={
        <>
          <span className="text-foreground">
            {budget?.label ?? gt("{label}: {left}% left", { label, left })}
          </span>
          {budget?.startsIn ? (
            <span className="text-muted-foreground">{budget.startsIn}</span>
          ) : null}
          {pace && timeLeft !== null ? (
            <span className="text-muted-foreground">
              {m(PACE_LABEL[pace])} · {gt("{timeLeft}% of the window left", { timeLeft })}
            </span>
          ) : null}
          {resetAt && resetsAt > now ? (
            <span className="text-muted-foreground">
              {gt("Resets in {duration} · {time}", {
                duration: formatDuration(resetsAt - now, m),
                time: formatUpcomingTimestamp(resetAt, timestampFormat, now, undefined, m),
              })}
            </span>
          ) : null}
        </>
      }
    />
  );
}

function PoolRow({ window, now }: { readonly window: LimitPoolWindow; readonly now: number }) {
  const gt = useGT();
  const m = useMessages();
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const { left, resetsAt, restoresPercent } = usageWindowDisplay(window, now);
  const accounts = window.members.length;
  const from = poolSources(window);
  const sourceLabels = [...from.hubs, ...(from.signedIn ? [gt("Signed-in accounts")] : [])];
  const reset = resetsAt
    ? {
        duration: formatDuration(Date.parse(resetsAt) - now, m),
        time: formatUpcomingTimestamp(resetsAt, timestampFormat, now, undefined, m),
      }
    : null;
  return (
    <UsageRow
      label={window.label}
      fill={left}
      tone={limitTone(left)}
      value={`${left}%`}
      ariaValue={gt("{left}% left", { left })}
      opensUsage
      tooltip={
        <>
          <span className="text-foreground">
            {accounts > 1
              ? gt("{label}: {left}% left across {accounts} accounts", {
                  label: window.label,
                  left,
                  accounts,
                })
              : gt("{label}: {left}% left", { label: window.label, left })}
          </span>
          {window.pace ? (
            <span className="text-muted-foreground">{m(PACE_LABEL[window.pace])}</span>
          ) : null}
          {restoresPercent !== undefined && reset ? (
            <span className="text-muted-foreground">
              {accounts > 1
                ? gt("+{percent}% in {duration} · {time}", {
                    percent: restoresPercent,
                    ...reset,
                  })
                : gt("Resets in {duration} · {time}", reset)}
            </span>
          ) : null}
          {sourceLabels.length > 0 ? (
            <span className="text-muted-foreground">
              {gt("From {sources}", { sources: sourceLabels.join(", ") })}
            </span>
          ) : null}
        </>
      }
    />
  );
}

/** One label, bar, and value row; the whole row opens the details tooltip. With `opensUsage` it links to the usage page. */
function UsageRow({
  label,
  fill,
  tone,
  tick = null,
  value,
  ariaValue = value,
  tooltip,
  muted = false,
  opensUsage = false,
}: {
  readonly label: string;
  /** Bar fill from 0 to 100. Null hides the bar. */
  readonly fill: number | null;
  readonly tone: UsageTone;
  /** A marker on the bar, from 0 to 100. */
  readonly tick?: number | null;
  readonly value: string;
  readonly ariaValue?: string;
  readonly tooltip: ReactNode;
  readonly muted?: boolean;
  readonly opensUsage?: boolean;
}) {
  const gt = useGT();
  const rowProps = {
    "aria-label": gt("{label}: {value}", { label, value: ariaValue }),
    className: cn(
      "col-span-3 grid h-6 grid-cols-subgrid items-center rounded-lg px-2.5 outline-none hover:bg-black/[0.035] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-popup-open:bg-black/[0.035] dark:hover:bg-white/[0.08] dark:data-popup-open:bg-white/[0.08]",
      opensUsage
        ? "group cursor-pointer active:bg-black/[0.06] dark:active:bg-white/[0.12]"
        : "cursor-default",
    ),
  };
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          opensUsage ? <Link to="/usage" {...rowProps} /> : <div tabIndex={0} {...rowProps} />
        }
      >
        <span className="max-w-28 truncate text-muted-foreground group-hover:text-foreground">
          {label}
        </span>
        {fill !== null ? <UsageBar fill={fill} tone={tone} tick={tick} muted={muted} /> : null}
        <span
          className={cn(
            // Text-only rows span the bar column so they never widen the shared value column.
            "text-end font-medium tabular-nums",
            fill === null && "col-span-2",
            tone === "error"
              ? "text-error-foreground"
              : tone === "warning"
                ? "text-warning-foreground"
                : fill === null
                  ? "text-muted-foreground"
                  : "text-foreground/80",
          )}
        >
          {value}
        </span>
      </TooltipTrigger>
      {/* Rows sit 8px inside the card; clear its edge instead of overlapping it. */}
      <TooltipPopup side="left" sideOffset={16}>
        <div className="flex flex-col gap-0.5">
          {tooltip}
          {opensUsage ? <span className="text-muted-foreground">{gt("Open usage")}</span> : null}
        </div>
      </TooltipPopup>
    </Tooltip>
  );
}
