import { CodexModelContextWindows, type ServerProviderModel } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { T, useGT, useLocale } from "gt-react";
import { useId, useState } from "react";

import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingsRow } from "./settingsLayout";

const EMPTY_WINDOWS: typeof CodexModelContextWindows.Type = {};
const isContextWindows = Schema.is(CodexModelContextWindows);
const DEFAULT_WINDOW = "default";
const WINDOW_PRESETS = [
  { value: "128000", label: "128K" },
  { value: "256000", label: "256K" },
  { value: "512000", label: "512K" },
  { value: "1000000", label: "1M" },
];

export function CodexContextWindowSetting({
  models,
  stored,
  disabled,
  managed,
  onSave,
}: {
  readonly models: readonly ServerProviderModel[];
  readonly stored: unknown;
  readonly disabled: boolean;
  readonly managed?: string | undefined;
  readonly onSave: (windows: typeof CodexModelContextWindows.Type) => Promise<boolean>;
}) {
  const gt = useGT();
  const locale = useLocale();
  const id = useId();
  const [selection, setSelection] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<"saved" | "failed" | null>(null);
  const windows = isContextWindows(stored) ? stored : EMPTY_WINDOWS;
  const items = [
    ...models.map((model) => ({ value: model.slug, label: model.name })),
    ...Object.keys(windows)
      .filter((slug) => !models.some((model) => model.slug === slug))
      .map((slug) => ({ value: slug, label: slug })),
  ];
  const model =
    (items.some((item) => item.value === selection) ? selection : null) ??
    Object.keys(windows)[0] ??
    models.find((entry) => entry.isDefault)?.slug ??
    items[0]?.value;
  if (model === undefined) return null;

  const saved = Object.hasOwn(windows, model) ? String(windows[model]) : DEFAULT_WINDOW;
  const value = draft ?? saved;
  const windowItems = [{ value: DEFAULT_WINDOW, label: gt("Model default") }, ...WINDOW_PRESETS];
  if (!windowItems.some((item) => item.value === saved)) {
    windowItems.push({ value: saved, label: new Intl.NumberFormat(locale).format(Number(saved)) });
  }
  const canEdit = !disabled && !managed && !saving;
  const update = async (next: string) => {
    const entries =
      next === DEFAULT_WINDOW
        ? Object.entries(windows).filter(([slug]) => slug !== model)
        : [...Object.entries(windows), [model, Number(next)] as const];
    setSaving(true);
    setSaveResult(null);
    const ok = await onSave(Object.fromEntries(entries));
    setSaving(false);
    setSaveResult(ok ? "saved" : "failed");
    if (ok) setDraft(next);
  };

  return (
    <SettingsRow
      title={gt("Context window")}
      description={gt("Set a token limit for an individual Codex model.")}
      managed={managed}
      control={
        <Popover
          onOpenChange={(open) => {
            if (open) {
              setDraft(null);
              setSaveResult(null);
            }
          }}
        >
          <PopoverTrigger render={<Button variant="outline" size="sm" />}>
            <T>Configure</T>
          </PopoverTrigger>
          <PopoverPopup align="end" width="md" aria-label={gt("Context window")}>
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (canEdit && value !== saved) void update(value);
              }}
            >
              <div className="grid gap-1.5">
                <label htmlFor={`${id}-model`} className="text-sm font-medium">
                  <T>Model</T>
                </label>
                <Select
                  items={items}
                  value={model}
                  disabled={saving}
                  onValueChange={(slug) => {
                    setSelection(slug);
                    setDraft(null);
                    setSaveResult(null);
                  }}
                >
                  <SelectTrigger id={`${id}-model`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {items.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor={id} className="text-sm font-medium">
                  <T>Context window (tokens)</T>
                </label>
                <Select
                  items={windowItems}
                  value={value}
                  disabled={!canEdit}
                  onValueChange={(next) => {
                    setDraft(next);
                    setSaveResult(null);
                  }}
                >
                  <SelectTrigger id={id} aria-describedby={`${id}-hint`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {windowItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                <p id={`${id}-hint`} className="text-xs text-muted-foreground">
                  {gt(
                    "Applies when the agent session starts or restarts. Codex may cap this value.",
                  )}
                </p>
              </div>
              {saveResult === "failed" ? (
                <p role="alert" className="text-xs text-destructive">
                  <T>Could not save the context window.</T>
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span role="status" className="me-auto text-xs text-muted-foreground">
                  {saveResult === "saved" ? gt("Saved") : null}
                </span>
                <Button size="sm" type="submit" disabled={!canEdit || value === saved}>
                  {saving ? gt("Saving…") : gt("Save")}
                </Button>
              </div>
            </form>
          </PopoverPopup>
        </Popover>
      }
    />
  );
}
