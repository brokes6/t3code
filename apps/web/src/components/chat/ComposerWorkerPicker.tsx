import type { ComposerWorkerRequest } from "@t3tools/contracts";
import { useGT } from "gt-react";
import { UsersRoundIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { isProviderInstancePickerReady, type ProviderInstanceEntry } from "../../providerInstances";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

const COUNTS = [1, 2, 3] as const;
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

export function ComposerWorkerPicker({
  request,
  providers,
  onApply,
  onClose,
}: {
  request: ComposerWorkerRequest | undefined;
  providers: ReadonlyArray<ProviderInstanceEntry>;
  onApply: (request: ComposerWorkerRequest) => void;
  onClose: () => void;
}) {
  const gt = useGT();
  const [count, setCount] = useState<ComposerWorkerRequest["count"]>(request?.count ?? 1);
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{gt("Add workers")}</DialogTitle>
          <DialogDescription>
            {gt("The main agent assigns work after you send this message.")}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">{gt("Workers")}</span>
              <div className="flex gap-1" role="group" aria-label={gt("Workers")}>
                {COUNTS.map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    type="button"
                    variant={value === count ? "secondary" : "ghost"}
                    aria-pressed={value === count}
                    onClick={() => setCount(value)}
                  >
                    {value}
                  </Button>
                ))}
              </div>
            </div>
            <Select
              value={selected}
              items={choices}
              onValueChange={(value) => {
                if (value !== null) setSelected(value);
              }}
            >
              <SelectTrigger aria-label={gt("Worker model")}>
                <SelectValue placeholder={gt("Worker model unavailable")} />
              </SelectTrigger>
              <SelectPopup>
                {choices.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {gt("Cancel")}
          </Button>
          <Button
            type="button"
            disabled={!selection}
            onClick={() => {
              if (selection) onApply({ count, model: selection.model });
            }}
          >
            {gt("Apply to this message")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
