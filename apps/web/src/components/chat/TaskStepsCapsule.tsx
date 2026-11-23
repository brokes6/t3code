import type { OrchestrationV2PlanStep } from "@t3tools/contracts";
import { formatDuration } from "@t3tools/shared/orchestrationTimingCopy";
import { useGT, useMessages } from "gt-react";
import { ChevronUpIcon, CircleCheckIcon, CircleDotIcon, CircleIcon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";

const STATUS_ICON = {
  completed: <CircleCheckIcon className="text-success" />,
  running: <CircleDotIcon className="text-info-foreground" />,
  pending: <CircleIcon className="text-muted-foreground" />,
} as const;

export function TaskStepsCapsule({
  steps,
  explanation,
}: {
  readonly steps: ReadonlyArray<OrchestrationV2PlanStep>;
  readonly explanation?: string | undefined;
}) {
  const gt = useGT();
  const messages = useMessages();
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  if (steps.length === 0) return null;

  const done = steps.filter((step) => step.status === "completed").length;
  const allDone = done === steps.length;
  const totalDuration =
    allDone && steps.every((step) => step.durationMs !== undefined)
      ? steps.reduce((total, step) => total + (step.durationMs ?? 0), 0)
      : null;
  const statusLabels = {
    completed: gt("Completed"),
    running: gt("Running"),
    pending: gt("Pending"),
  };

  return (
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded}
      data-task-steps-capsule=""
      className="mx-auto mb-2 flex w-fit max-w-full flex-col-reverse items-center"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !expanded) return;
        event.stopPropagation();
        setExpanded(false);
        toggleRef.current?.focus();
      }}
    >
      <CollapsibleTrigger
        ref={toggleRef}
        className="flex min-h-8 max-w-full cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-10"
      >
        {allDone ? (
          <CircleCheckIcon aria-hidden className="size-3.5 shrink-0 text-success" />
        ) : (
          <CircleDotIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 truncate tabular-nums">
          {gt("Tasks {done}/{total}", { done, total: steps.length })}
        </span>
        {totalDuration === null ? null : (
          <span className="shrink-0 font-normal text-muted-foreground tabular-nums">
            · {formatDuration(totalDuration, messages)}
          </span>
        )}
        <ChevronUpIcon
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out",
            expanded && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsiblePanel className="flex w-96 max-w-full flex-col justify-end">
        <div className="shrink-0 pb-1.5" inert={!expanded}>
          <section
            aria-labelledby={`${panelId}-title`}
            tabIndex={0}
            className="max-h-[min(15rem,30dvh)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-2 text-popover-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <h2 id={`${panelId}-title`} className="px-2 py-1.5 text-xs font-medium">
              {gt("Task steps")}
            </h2>
            {explanation ? (
              <p className="px-2 pb-1.5 text-xs/4 wrap-anywhere text-muted-foreground">
                {explanation}
              </p>
            ) : null}
            <ol>
              {steps.map((step) => (
                <li
                  key={step.id}
                  aria-current={step.status === "running" ? "step" : undefined}
                  className={cn(
                    "flex items-start gap-2 rounded-md px-2 py-1.5 text-xs/4",
                    step.status === "running" && "bg-accent",
                    step.status !== "running" && "text-muted-foreground",
                  )}
                >
                  <span aria-hidden className="mt-px shrink-0 [&>svg]:size-3.5">
                    {STATUS_ICON[step.status]}
                  </span>
                  <span className="sr-only">{statusLabels[step.status]}: </span>
                  <span className="min-w-0 flex-1 wrap-anywhere">{step.text}</span>
                  {step.durationMs === undefined ? null : (
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {formatDuration(step.durationMs, messages)}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
