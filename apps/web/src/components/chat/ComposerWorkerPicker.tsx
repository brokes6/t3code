import { MAX_COMPOSER_WORKERS, type ComposerWorkerRequest } from "@t3tools/contracts";
import { useGT } from "gt-react";
import { CheckIcon, UsersRoundIcon, XIcon } from "lucide-react";
import { useId, useRef, useState, type RefObject } from "react";

import { isProviderInstancePickerReady, type ProviderInstanceEntry } from "../../providerInstances";
import { Button } from "../ui/button";
import { Popover, PopoverClose, PopoverPopup, PopoverTitle } from "../ui/popover";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { composerFloatingLayerProps, useComposerMenuProps } from "./composerEventScope";

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
  const countFocusRef = useRef<HTMLButtonElement>(null);

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
        initialFocus={countFocusRef}
        aria-describedby={descriptionId}
      >
        <WorkerPickerFields
          {...fields}
          descriptionId={descriptionId}
          countFocusRef={countFocusRef}
        />
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
  countFocusRef,
}: WorkerPickerFieldsProps & {
  descriptionId: string;
  countFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const gt = useGT();
  const max = Math.min(maxCount, MAX_COMPOSER_WORKERS);
  const [requestedCount, setRequestedCount] = useState(request?.count ?? 1);
  const count = Math.min(requestedCount, max);
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
        <div className="grid min-w-0 gap-1">
          <span className="text-xs text-muted-foreground">{gt("Workers")}</span>
          <ToggleGroup
            aria-label={gt("Workers")}
            className="w-full"
            value={[String(count)]}
            onValueChange={([next]) => {
              if (next !== undefined) setRequestedCount(Number(next));
            }}
          >
            {Array.from({ length: max }, (_, index) => {
              const option = index + 1;
              return (
                <ToggleGroupItem
                  key={option}
                  ref={option === count ? countFocusRef : undefined}
                  value={String(option)}
                  className="flex-1"
                >
                  {option}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
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
          disabled={!selection}
          onClick={() => {
            if (selection) onApply({ count, model: selection.model });
          }}
        >
          <CheckIcon />
          {gt("Apply to this message")}
        </Button>
      </div>
    </div>
  );
}
