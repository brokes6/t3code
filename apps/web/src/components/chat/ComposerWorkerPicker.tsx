import { MAX_COMPOSER_WORKERS, type ComposerWorkerRequest } from "@t3tools/contracts";
import { useGT } from "gt-react";
import { UsersRoundIcon, XIcon } from "lucide-react";
import { useId, useState, type CSSProperties, type RefObject } from "react";

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
        width="md"
        padding="none"
        aria-describedby={descriptionId}
      >
        <WorkerPickerFields {...fields} descriptionId={descriptionId} />
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
}: WorkerPickerFieldsProps & { descriptionId: string }) {
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
    <>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <PopoverTitle>{gt("Add workers")}</PopoverTitle>
        <PopoverClose
          render={<Button type="button" variant="ghost" size="icon-xs" />}
          aria-label={gt("Cancel")}
        >
          <XIcon />
        </PopoverClose>
      </div>
      <p id={descriptionId} className="sr-only">
        {gt("The main agent assigns work after you send this message.")}
      </p>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-3 py-3">
        <span className="text-xs text-muted-foreground">{gt("Workers")}</span>
        <div className="min-w-0">
          <input
            type="range"
            className="settings-slider w-full"
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
            className="flex justify-between px-2 text-3xs text-muted-foreground tabular-nums"
          >
            <span className="flex w-0 justify-center">1</span>
            <span className="flex w-0 justify-center">2</span>
            <span className="flex w-0 justify-center">3</span>
            {max > 3 ? <span className="flex w-0 justify-end">{gt("Custom")}</span> : null}
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
        <span className="text-xs text-muted-foreground">{gt("Worker model")}</span>
        <Select
          value={selected}
          items={choices}
          onValueChange={(value) => {
            if (value !== null) setSelected(value);
          }}
        >
          <SelectTrigger size="compact" aria-label={gt("Worker model")} className="min-w-0">
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
      <div className="flex justify-end border-t border-border px-3 py-2">
        <Button
          type="button"
          size="sm"
          disabled={!selection || !validCount}
          onClick={() => {
            if (selection && validCount) onApply({ count, model: selection.model });
          }}
        >
          {gt("Apply to this message")}
        </Button>
      </div>
    </>
  );
}
