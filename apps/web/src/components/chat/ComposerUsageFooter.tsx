import {
  AuthSettingsWriteScope,
  type EnvironmentId,
  type OrchestrationV2ProviderThread,
  type OrchestrationV2ProviderTurn,
  type OrchestrationV2RunAttempt,
  type ThreadId,
} from "@t3tools/contracts";
import { deriveThreadUsageSummary } from "@t3tools/client-runtime/state/usage";
import { formatDuration as formatTurnDuration } from "@t3tools/shared/orchestrationTimingCopy";
import { formatCount, formatUsd } from "@t3tools/shared/usageFormat";
import { formatResetsIn } from "@t3tools/shared/usageLimitsCopy";
import { useGT, useLocale, useMessages } from "gt-react";
import { CoinsIcon, GaugeIcon } from "lucide-react";
import { Fragment, lazy, Suspense, useState, type ReactNode } from "react";

import { useWorkerUsage } from "../../state/entities";
import { useNowMinute } from "../../hooks/useNowMinute";
import { contextWindowDisplay, formatContextWindowTokens } from "../../lib/contextWindow";
import { cn } from "../../lib/utils";
import { spendBudgetDetails, spendBudgetLabel } from "../../lib/spendBudget";
import { useEnvironmentScope } from "../../state/session";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Separator } from "../ui/separator";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { formatContextWindowCompactionMessage } from "./compaction.logic";
import { composerFloatingLayerProps } from "./composerEventScope";
import { limitTone, UsageBar } from "../usage/UsageBar";
import type { ThreadDetailsUsageInput } from "./ThreadDetailsUsage";
import {
  limitResetCreditCount,
  resolveThreadDetailsLimits,
  usageWindowDisplay,
} from "./ThreadDetailsUsage.logic";

type ThreadUsage = ReturnType<typeof deriveThreadUsageSummary>;

const UsagePriceOverrides = lazy(() =>
  import("../usage/UsagePriceOverrides").then((module) => ({
    default: module.UsagePriceOverrides,
  })),
);

export function ComposerUsageFooter({
  usage,
  turns,
  attempts,
  threadId,
  activeProviderThread,
  hasMoreHistory,
  environmentId,
}: {
  readonly usage: ThreadDetailsUsageInput;
  readonly turns: readonly OrchestrationV2ProviderTurn[];
  readonly attempts: readonly OrchestrationV2RunAttempt[];
  readonly threadId: ThreadId;
  readonly activeProviderThread: OrchestrationV2ProviderThread | undefined;
  readonly hasMoreHistory: boolean;
  readonly environmentId: EnvironmentId;
}) {
  const { groups, partial } = useWorkerUsage({ environmentId, threadId });
  const summary = deriveThreadUsageSummary(turns, activeProviderThread, { attempts, groups });
  const showCost =
    summary.totalCostUsd !== null || summary.lastTurn !== null || summary.unpricedModels.length > 0;
  return (
    <div className="@container/composer-usage mx-auto w-full max-w-(--chat-content-max-width)">
      <div
        className="pointer-events-auto flex min-w-0 flex-wrap items-center justify-between gap-x-2 px-2 pt-1 text-xs tabular-nums not-has-[button]:hidden"
        data-composer-context-control=""
      >
        {usage.contextWindow ? <ContextItem usage={usage.contextWindow} /> : null}
        <div className="ms-auto flex min-w-0 items-center justify-end gap-0.5 empty:hidden">
          {showCost ? (
            <CostItem
              summary={summary}
              hasMoreHistory={hasMoreHistory || partial}
              environmentId={environmentId}
            />
          ) : null}
          <LimitsItem
            providerInstanceId={usage.providerInstanceId}
            model={usage.model}
            providers={usage.providers}
            sources={usage.sources}
          />
        </div>
      </div>
    </div>
  );
}

function UsageItem({
  title,
  label,
  trigger,
  children,
  open,
  onOpenChange,
  align = "end",
}: {
  readonly title: string;
  readonly label: string;
  readonly trigger: ReactNode;
  readonly children: ReactNode;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly align?: "start" | "end";
}) {
  return (
    <Popover {...(open === undefined ? {} : { open })} {...(onOpenChange ? { onOpenChange } : {})}>
      <Tooltip>
        <TooltipTrigger
          render={<PopoverTrigger render={<Button variant="ghost-muted" size="compact" />} />}
          aria-label={label}
        >
          {trigger}
        </TooltipTrigger>
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
      <PopoverPopup
        {...composerFloatingLayerProps}
        side="top"
        align={align}
        width="sm"
        padding="compact"
      >
        <div className="grid gap-2 text-xs tabular-nums">
          <PopoverTitle>
            <span className="text-xs font-medium text-muted-foreground">{title}</span>
          </PopoverTitle>
          {children}
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function UsageDetail({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <>
      <dt className="min-w-0 break-words text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-end text-foreground">{children}</dd>
    </>
  );
}

function CostItem({
  summary,
  hasMoreHistory,
  environmentId,
}: {
  readonly summary: ThreadUsage;
  readonly hasMoreHistory: boolean;
  readonly environmentId: EnvironmentId;
}) {
  const gt = useGT();
  const locale = useLocale();
  const m = useMessages();
  const canEditPricing = useEnvironmentScope(environmentId, AuthSettingsWriteScope);
  const [open, setOpen] = useState(false);
  const [priceModel, setPriceModel] = useState<string | null>(null);
  const cost = summary.totalCostUsd === null ? null : formatUsd(summary.totalCostUsd, locale);
  const title = hasMoreHistory ? gt("Loaded turn cost") : gt("Thread cost");
  const lastTurn = summary.lastTurn;
  const lastTurnDetails =
    lastTurn === null
      ? []
      : [
          { label: gt("Model"), value: lastTurn.model },
          {
            label: gt("Cost"),
            value: lastTurn.costUsd === null ? null : formatUsd(lastTurn.costUsd, locale),
          },
          {
            label: gt("Workers"),
            value:
              "workerCostUsd" in lastTurn && typeof lastTurn.workerCostUsd === "number"
                ? formatUsd(lastTurn.workerCostUsd, locale)
                : null,
          },
          {
            label: gt("Input tokens"),
            value: lastTurn.inputTokens === null ? null : formatCount(lastTurn.inputTokens, locale),
          },
          {
            label: gt("Output tokens"),
            value:
              lastTurn.outputTokens === null ? null : formatCount(lastTurn.outputTokens, locale),
          },
          {
            label: gt("Cache read"),
            value:
              lastTurn.cacheReadTokens === null
                ? null
                : formatCount(lastTurn.cacheReadTokens, locale),
          },
          {
            label: gt("Cache write"),
            value:
              lastTurn.cacheWriteTokens === null
                ? null
                : formatCount(lastTurn.cacheWriteTokens, locale),
          },
          {
            label: gt("Cache hit"),
            value:
              lastTurn.cacheHitPercent === null
                ? null
                : gt("{percent}%", { percent: formatCount(lastTurn.cacheHitPercent, locale) }),
          },
          {
            label: gt("Duration"),
            value: lastTurn.durationMs === null ? null : formatTurnDuration(lastTurn.durationMs, m),
          },
          {
            label: gt("Output tokens/s"),
            value:
              lastTurn.outputTokensPerSecond === null
                ? null
                : lastTurn.outputTokensPerSecond.toLocaleString(locale, {
                    maximumFractionDigits: 1,
                  }),
          },
        ];
  return (
    <>
      <UsageItem
        title={title}
        label={gt("{label}: {value}", { label: title, value: cost ?? gt("No cost recorded") })}
        open={open}
        onOpenChange={setOpen}
        trigger={
          <>
            <CoinsIcon className="size-3.5" aria-hidden />
            {cost === null ? null : (
              <span className="hidden max-w-[12ch] min-w-[3ch] truncate text-end @min-[27rem]/composer-usage:inline">
                {cost}
              </span>
            )}
          </>
        }
      >
        <p className="text-lg leading-none font-semibold">{cost ?? gt("No cost recorded")}</p>
        {summary.costByModel.length > 0 ? (
          <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,8rem)] gap-x-3 gap-y-1">
            {summary.costByModel.map(({ model, costUsd }) => (
              <UsageDetail key={model ?? ""} label={model ?? gt("Unknown model")}>
                {formatUsd(costUsd, locale)}
              </UsageDetail>
            ))}
          </dl>
        ) : null}
        {summary.hasUntrackedTurns ? (
          <p className="text-muted-foreground">
            {gt("Turns that finished before cost tracking have no cost.")}
          </p>
        ) : null}
        {summary.hasUnpricedTurns ? (
          <p className="text-muted-foreground">{gt("Some turns have no price or token data.")}</p>
        ) : null}
        {canEditPricing && summary.unpricedModels.length > 0 ? (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1">
            {summary.unpricedModels.map((model) => (
              <Fragment key={model}>
                <span className="min-w-0 break-words text-muted-foreground">{model}</span>
                <Button
                  size="compact"
                  variant="ghost-muted"
                  aria-label={gt("Set price for {model}", { model })}
                  onClick={() => {
                    setOpen(false);
                    setPriceModel(model);
                  }}
                >
                  {gt("Set price")}
                </Button>
              </Fragment>
            ))}
          </div>
        ) : null}
        {lastTurn !== null ? (
          <>
            <Separator />
            <h3 className="font-medium text-muted-foreground">{gt("Last turn")}</h3>
            <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-1">
              {lastTurnDetails.map(({ label, value }) =>
                value === null ? null : (
                  <UsageDetail key={label} label={label}>
                    {value}
                  </UsageDetail>
                ),
              )}
            </dl>
          </>
        ) : null}
      </UsageItem>
      {priceModel !== null ? (
        <Suspense fallback={null}>
          <UsagePriceOverrides
            environmentId={environmentId}
            initialModel={priceModel}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) setPriceModel(null);
            }}
          />
        </Suspense>
      ) : null}
    </>
  );
}

function ContextItem({
  usage,
}: {
  readonly usage: NonNullable<ThreadDetailsUsageInput["contextWindow"]>;
}) {
  const gt = useGT();
  const locale = useLocale();
  const m = useMessages();
  const { used, maxTokens, threshold, tick, tone } = contextWindowDisplay(usage);
  const title = gt("Context window");
  const value =
    used === null
      ? formatContextWindowTokens(usage.usedTokens)
      : gt("{percent}%", { percent: formatCount(used, locale) });
  const toneText =
    tone === "error"
      ? "text-error-foreground"
      : tone === "warning"
        ? "text-warning-foreground"
        : undefined;
  return (
    <UsageItem
      title={title}
      label={
        used === null
          ? gt("Context: {usedTokens} tokens used", { usedTokens: value })
          : gt("Context: {used}% used", { used })
      }
      align="start"
      trigger={
        <>
          <span className="hidden @min-[21rem]/composer-usage:inline">
            {gt("Context", { $context: "context window row label" })}
          </span>
          {used !== null ? (
            <span className="w-8 @min-[25rem]/composer-usage:w-11">
              <UsageBar fill={used} tone={tone} tick={tick} color="var(--info)" accentTick />
            </span>
          ) : null}
          <span className="text-foreground">
            {formatContextWindowTokens(usage.usedTokens)}
            {maxTokens === null ? "" : `/${formatContextWindowTokens(maxTokens)}`}
          </span>
          {used !== null ? <span className={toneText}>{value}</span> : null}
        </>
      }
    >
      <p className={cn("text-lg leading-none font-semibold", toneText)}>
        {used === null
          ? gt("{usedTokens} tokens used", { usedTokens: value })
          : gt("{used}% used", { used })}
      </p>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3">
        <UsageDetail label={gt("Tokens")}>
          {maxTokens === null
            ? formatCount(usage.usedTokens, locale)
            : `${formatCount(usage.usedTokens, locale)} / ${formatCount(maxTokens, locale)}`}
        </UsageDetail>
      </dl>
      {usage.compactsAutomatically || (threshold !== null && threshold > 0) ? (
        <>
          <Separator />
          <p className="text-muted-foreground">
            {formatContextWindowCompactionMessage(threshold, m, locale)}
          </p>
        </>
      ) : null}
    </UsageItem>
  );
}

function LimitsItem({
  providerInstanceId,
  model,
  providers,
  sources,
}: Omit<ThreadDetailsUsageInput, "contextWindow">) {
  const gt = useGT();
  const locale = useLocale();
  const m = useMessages();
  const now = Date.parse(`${useNowMinute()}:00Z`);
  const resolved = resolveThreadDetailsLimits(providerInstanceId, model, providers, sources, now);
  if (resolved === null) return null;
  const windows = resolved.kind === "pool" ? resolved.windows : resolved.limits.windows;
  const credits = limitResetCreditCount(resolved);
  const rows = [...windows, ...(resolved.budget ? [resolved.budget] : [])].map((window) => ({
    window,
    ...usageWindowDisplay(window, now),
    label: "members" in window ? window.label : spendBudgetLabel(window, m),
    budget: "members" in window ? null : spendBudgetDetails(window, locale, m, now),
  }));
  const fiveHour = rows.find(({ window }) =>
    "members" in window
      ? window.kind === "session" &&
        window.members.some(({ window }) => window.windowDurationMins === 300)
      : window.windowDurationMins === 300 && window.spend === undefined,
  );
  const weekly = rows.find(
    ({ window }) => window.kind === "weekly" && ("members" in window || window.spend === undefined),
  );
  const primary = fiveHour ?? weekly ?? rows[0];
  if (primary === undefined && credits === undefined) return null;
  const title = gt("Usage limits");
  const value = (left: number) => gt("{percent}%", { percent: formatCount(left, locale) });
  const visible = [
    ...(fiveHour ? [{ row: fiveHour, duration: "5h", color: "stroke-success" }] : []),
    ...(weekly && weekly !== fiveHour
      ? [{ row: weekly, duration: "7d", color: "stroke-warning" }]
      : []),
  ];
  const extra = rows.length - (visible.length || (primary ? 1 : 0));
  return (
    <div className="min-w-0">
      <UsageItem
        title={title}
        label={
          (visible.length > 0 ? visible.map(({ row }) => row) : primary ? [primary] : [])
            .map(({ label, left }) => gt("{label}: {left}% left", { label, left }))
            .join(" · ") || title
        }
        trigger={
          <>
            {visible.length === 0 ? (
              <>
                <GaugeIcon className="size-3.5" aria-hidden />
                {primary ? (
                  <>
                    <span className="hidden max-w-[12ch] truncate @min-[31rem]/composer-usage:inline">
                      {primary.label}
                    </span>
                    <span className="text-foreground">{value(primary.left)}</span>
                  </>
                ) : null}
              </>
            ) : (
              visible.map(({ row, duration, color }, index) => (
                <span key={duration} className="inline-flex items-center gap-1">
                  {index > 0 ? (
                    <span aria-hidden className="me-0.5 text-muted-foreground/60">
                      ·
                    </span>
                  ) : null}
                  <LimitRing left={row.left} tick={row.tick} color={color} />
                  <span>{duration}</span>
                  <span className="text-foreground">{value(row.left)}</span>
                </span>
              ))
            )}
            {extra > 0 ? <span>+{formatCount(extra, locale)}</span> : null}
          </>
        }
      >
        {primary ? (
          <p className="text-lg leading-none font-semibold">
            {gt("{left}% left", { left: primary.left })}
          </p>
        ) : null}
        {rows.length > 0 ? (
          <dl className="grid gap-2">
            {rows.map(({ window, label, budget, left, tick, resetWindow }) => {
              const reset = resetWindow === undefined ? null : formatResetsIn(resetWindow, now, m);
              const tone = budget?.over ? "error" : limitTone(left);
              return (
                <div
                  key={window.id}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(2.5rem,0.5fr)_auto] items-center gap-x-2 gap-y-0.5"
                >
                  <dt className="min-w-0 break-words text-muted-foreground">{label}</dt>
                  <dd className="contents">
                    <UsageBar fill={left} tick={tick} tone={tone} />
                    <span
                      className={cn(
                        "min-w-[4ch] text-end",
                        tone === "error"
                          ? "text-error-foreground"
                          : tone === "warning"
                            ? "text-warning-foreground"
                            : null,
                      )}
                    >
                      {value(left)}
                    </span>
                    {budget ? (
                      <span
                        className={cn(
                          "col-span-3 text-muted-foreground",
                          budget.over && "text-error-foreground",
                        )}
                      >
                        {budget.label}
                      </span>
                    ) : null}
                    {budget?.startsIn ? (
                      <span className="col-span-3 text-muted-foreground">{budget.startsIn}</span>
                    ) : null}
                    {reset !== null ? (
                      <span className="col-span-3 text-muted-foreground">{reset}</span>
                    ) : null}
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : null}
        {credits !== undefined ? (
          <>
            {primary ? <Separator /> : null}
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3">
              <UsageDetail label={gt("Reset credits")}>{formatCount(credits, locale)}</UsageDetail>
            </dl>
          </>
        ) : null}
      </UsageItem>
    </div>
  );
}

function LimitRing({
  left,
  tick,
  color,
}: {
  readonly left: number;
  readonly tick: number | null;
  readonly color: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" className="size-3.5 shrink-0">
      <circle cx="8" cy="8" r="6" strokeWidth="1.75" className="stroke-muted-foreground/30" />
      {left > 0 ? (
        <circle
          cx="8"
          cy="8"
          r="6"
          pathLength="100"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeDasharray={`${left} 100`}
          transform="rotate(-90 8 8)"
          className={left <= 10 ? "stroke-error" : color}
        />
      ) : null}
      {tick !== null ? (
        <circle
          cx="8"
          cy="2"
          r="1.35"
          transform={`rotate(${tick * 3.6} 8 8)`}
          className="fill-foreground stroke-background"
        />
      ) : null}
    </svg>
  );
}
