import { MAX_COMPOSER_WORKERS, type ComposerWorkerRequest } from "@t3tools/contracts";
import { useGT } from "gt-react";
import { CheckIcon, UsersRoundIcon, XIcon } from "lucide-react";
import { useId, useRef, useState, type CSSProperties, type RefObject } from "react";

import { cn } from "../../lib/utils";
import { isProviderInstancePickerReady, type ProviderInstanceEntry } from "../../providerInstances";
import { Button } from "../ui/button";
import { Popover, PopoverClose, PopoverPopup, PopoverTitle } from "../ui/popover";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

import { Input } from "../ui/input";
import { composerFloatingLayerProps, useComposerMenuProps } from "./composerEventScope";

const CUSTOM_STOP = 4;
const modelKey = (model: ComposerWorkerRequest["model"]) =>
  typeof model === "string" ? model : JSON.stringify([model.instanceId, model.model]);

export function ComposerWorkerChip({
  request,
  onEdit,
  onRemove,
}: {
  request: ComposerWorkerRequest;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const gt = useGT();
  const model =
    request.model === "inherit"
      ? gt("Same as main agent")
      : request.model === "auto"
        ? gt("Agent chooses")
        : request.model.model;
  const label = gt("{count, plural, one {{count} worker} other {{count} workers}}", {
    count: request.count,
  });
  const summary = (
    <>
      <UsersRoundIcon aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">
        {label} · {model}
      </span>
    </>
  );

  return (
    <span className="inline-flex min-w-0 max-w-full items-center rounded-md border border-border text-xs text-muted-foreground">
      {onEdit ? (
        <Button type="button" variant="ghost" size="xs" onClick={onEdit}>
          {summary}
        </Button>
      ) : (
        <span className="inline-flex min-w-0 items-center gap-1.5 px-2 py-1">{summary}</span>
      )}
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={gt("Remove worker configuration")}
          onClick={onRemove}
        >
          <XIcon />
        </Button>
      ) : null}
    </span>
  );
}

type WorkerPickerFieldsProps = {
  maxCount: number;
  request: ComposerWorkerRequest | undefined;
  providers: ReadonlyArray<ProviderInstanceEntry>;
  onApply: (request: ComposerWorkerRequest) => void;
};

export function ComposerWorkerPicker({
  open,
  anchor,
  onClose,
  ...fields
}: WorkerPickerFieldsProps & {
  open: boolean;
  anchor: RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  const menuProps = useComposerMenuProps();
  const descriptionId = useId();
  const sliderRef = useRef<HTMLInputElement>(null);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <PopoverPopup
        {...menuProps}
        anchor={anchor}
        side="top"
        align="start"
        sideOffset={8}
        width="sm"
        padding="compact"
        initialFocus={sliderRef}
        aria-describedby={descriptionId}
      >
        <WorkerPickerFields {...fields} descriptionId={descriptionId} sliderRef={sliderRef} />
      </PopoverPopup>
    </Popover>
  );
}

function WorkerPickerFields({
  maxCount,
  request,
  providers,
  onApply,
  descriptionId,
  sliderRef,
}: WorkerPickerFieldsProps & {
  descriptionId: string;
  sliderRef: RefObject<HTMLInputElement | null>;
}) {
  const gt = useGT();
  const max = Math.min(maxCount, MAX_COMPOSER_WORKERS);
  const [stop, setStop] = useState(Math.min(request?.count ?? 1, max > 3 ? CUSTOM_STOP : 3));
  const [customCount, setCustomCount] = useState(
    String(Math.max(CUSTOM_STOP, request?.count ?? 0)),
  );
  const lastStop = max > 3 ? CUSTOM_STOP : 3;
  const activeStop = Math.min(stop, lastStop);
  const custom = activeStop === CUSTOM_STOP;
  const sliderProgress = (activeStop - 1) / (lastStop - 1);
  const count = custom ? Number(customCount) : activeStop;
  const validCount = Number.isInteger(count) && count >= (custom ? CUSTOM_STOP : 1) && count <= max;
  const [selected, setSelected] = useState(modelKey(request?.model ?? "inherit"));
  const choices = [
    { value: "inherit", label: gt("Same as main agent"), model: "inherit" as const },
    { value: "auto", label: gt("Agent chooses"), model: "auto" as const },
    ...providers.filter(isProviderInstancePickerReady).flatMap((provider) =>
      provider.models.map((model) => {
        const selection = { instanceId: provider.instanceId, model: model.slug };
        return {
          value: modelKey(selection),
          label: `${provider.displayName} · ${model.name}`,
          model: selection,
        };
      }),
    ),
  ];
  const selection = choices.find((choice) => choice.value === selected);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <UsersRoundIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <PopoverTitle>{gt("Add workers")}</PopoverTitle>
        </div>
        <PopoverClose
          render={<Button type="button" variant="ghost-muted" size="icon-xs" />}
          aria-label={gt("Cancel")}
        >
          <XIcon />
        </PopoverClose>
      </div>
      <p id={descriptionId} className="sr-only">
        {gt("The main agent assigns work after you send this message.")}
      </p>
      <div className="grid gap-2">
        <div className="min-w-0">
          <span className="block text-xs text-muted-foreground">{gt("Workers")}</span>
          <input
            ref={sliderRef}
            type="range"
            className="settings-slider block w-full [--primary:var(--contrast-foreground)]"
            min={1}
            max={lastStop}
            step={1}
            value={activeStop}
            aria-label={gt("Workers")}
            aria-valuetext={custom ? gt("Custom") : String(activeStop)}
            style={
              {
                "--settings-slider-progress": `${sliderProgress * 100}%`,
                "--settings-slider-fill-offset": `${0.5 - sliderProgress}rem`,
              } as CSSProperties
            }
            onChange={(event) => setStop(event.currentTarget.valueAsNumber)}
          />
          <div
            aria-hidden
            className="flex justify-between px-2 text-2xs whitespace-nowrap text-muted-foreground tabular-nums"
          >
            {Array.from({ length: lastStop }, (_, index) => {
              const step = index + 1;
              return (
                <span
                  key={step}
                  className={cn(
                    "flex w-0 justify-center",
                    step === CUSTOM_STOP && "justify-end",
                    step === activeStop && "font-medium text-foreground",
                  )}
                >
                  {step === CUSTOM_STOP ? gt("Custom") : step}
                </span>
              );
            })}
          </div>
          {custom ? (
            <div className="mt-2 flex items-center gap-2">
              <Input
                type="number"
                size="compact"
                min={CUSTOM_STOP}
                max={max}
                step={1}
                value={customCount}
                aria-label={gt("Workers")}
                aria-invalid={!validCount}
                onChange={(event) => setCustomCount(event.currentTarget.value)}
              />
              <span aria-hidden className="shrink-0 text-xs text-muted-foreground tabular-nums">
                4–{max}
              </span>
            </div>
          ) : null}
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
          <span className="text-xs text-muted-foreground">{gt("Model")}</span>
          <Select
            value={selected}
            items={choices}
            onValueChange={(value) => {
              if (value !== null) setSelected(value);
            }}
          >
            <SelectTrigger
              variant="ghost"
              size="compact"
              aria-label={gt("Worker model")}
              className="min-w-0"
            >
              <SelectValue placeholder={gt("Worker model unavailable")} />
            </SelectTrigger>
            <SelectPopup {...composerFloatingLayerProps}>
              {choices.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
      </div>
      <div className="flex justify-end border-t border-border/60 pt-2">
        <Button
          type="button"
          variant="secondary"
          size="compact"
          disabled={!selection || !validCount}
          onClick={() => {
            if (selection && validCount) onApply({ count, model: selection.model });
          }}
        >
          <CheckIcon />
          {gt("Apply to this message")}
        </Button>
      </div>
    </div>
  );
}
