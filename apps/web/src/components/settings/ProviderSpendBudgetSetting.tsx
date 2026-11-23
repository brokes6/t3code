import { ProviderSpendBudget } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import { formatUsd } from "@t3tools/shared/usageFormat";
import { useGT, useLocale } from "gt-react";
import { useId, useState } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { FoldedSettingsSection } from "./FoldedSettingsSection";

const isBudget = Schema.is(ProviderSpendBudget);
const periods = ["day", "week", "month"] as const;

export function ProviderSpendBudgetSetting({
  id: sectionId,
  budget,
  disabled,
  onSave,
}: {
  readonly id: string;
  readonly budget: ProviderSpendBudget | undefined;
  readonly disabled: boolean;
  readonly onSave: (budget: ProviderSpendBudget | undefined) => Promise<boolean>;
}) {
  const gt = useGT();
  const locale = useLocale();
  const id = useId();
  const [defaults] = useState(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const startsAt = DateTime.formatIsoDate(DateTime.makeZonedUnsafe(new Date(), { timeZone }));
    return { amountUsd: "", period: "week" as const, startsAt, timeZone };
  });
  const [edits, setEdits] = useState<
    Partial<Omit<ProviderSpendBudget, "amountUsd"> & { amountUsd: string }>
  >({});
  const [pending, setPending] = useState(false);
  const saved = budget ? { ...budget, amountUsd: String(budget.amountUsd) } : defaults;
  const draft = { ...saved, ...edits };
  const candidate = {
    ...draft,
    amountUsd: Number(draft.amountUsd),
    timeZone: draft.timeZone.trim(),
  };
  const valid = isBudget(candidate);
  const dirty = Object.keys(edits).length > 0;
  const labels = { day: gt("Daily"), week: gt("Weekly"), month: gt("Monthly") };

  async function save(next: ProviderSpendBudget | undefined) {
    setPending(true);
    const saved = await onSave(next);
    setPending(false);
    if (saved) setEdits({});
  }

  return (
    <FoldedSettingsSection
      id={sectionId}
      title={gt("Spend budget")}
      summary={budget ? `${formatUsd(budget.amountUsd, locale)} · ${labels[budget.period]}` : null}
    >
      <div className="grid gap-3 px-3 py-3 sm:px-4">
        <p className="text-xs text-muted-foreground">
          {gt(
            "For API keys and custom endpoints. Only priced turns recorded by T3 Code count toward this budget.",
          )}
        </p>
        <form
          className="grid w-full max-w-sm gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && dirty && !disabled && !pending) void save(candidate);
          }}
        >
          <fieldset disabled={disabled || pending} className="grid min-w-0 grid-cols-2 gap-2">
            <div className="grid min-w-0 gap-1">
              <Label htmlFor={`${id}-amount`}>{gt("Amount (USD)")}</Label>
              <Input
                id={`${id}-amount`}
                size="sm"
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={draft.amountUsd}
                onChange={(event) => setEdits({ ...edits, amountUsd: event.target.value })}
              />
            </div>
            <div className="grid min-w-0 gap-1">
              <Label id={`${id}-period`}>{gt("Budget period")}</Label>
              <Select
                value={draft.period}
                disabled={disabled || pending}
                onValueChange={(period) => {
                  if (period !== null) setEdits({ ...edits, period });
                }}
              >
                <SelectTrigger size="sm" aria-labelledby={`${id}-period`}>
                  <SelectValue>{labels[draft.period]}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {periods.map((period) => (
                    <SelectItem key={period} value={period}>
                      {labels[period]}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
            <div className="grid min-w-0 gap-1">
              <Label htmlFor={`${id}-anchor`}>{gt("Start date")}</Label>
              <Input
                id={`${id}-anchor`}
                size="sm"
                type="date"
                value={draft.startsAt}
                onChange={(event) => setEdits({ ...edits, startsAt: event.target.value })}
              />
            </div>
            <div className="grid min-w-0 gap-1">
              <Label htmlFor={`${id}-zone`}>{gt("Time zone")}</Label>
              <Input
                id={`${id}-zone`}
                size="sm"
                spellCheck={false}
                value={draft.timeZone}
                onChange={(event) => setEdits({ ...edits, timeZone: event.target.value })}
              />
            </div>
          </fieldset>
          {dirty && !valid ? (
            <p className="text-xs text-muted-foreground">
              {gt("Enter a positive amount, a valid date, and an IANA time zone.")}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            {budget !== undefined ? (
              <Button
                size="xs"
                variant="ghost"
                type="button"
                disabled={disabled || pending}
                onClick={() => void save(undefined)}
              >
                {gt("Clear budget")}
              </Button>
            ) : null}
            <Button
              size="xs"
              variant="outline"
              type="submit"
              disabled={disabled || pending || !dirty || !valid}
            >
              {pending ? gt("Saving…") : gt("Save budget")}
            </Button>
          </div>
        </form>
      </div>
    </FoldedSettingsSection>
  );
}
