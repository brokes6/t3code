import type { EnvironmentId, ServerProvider, UnifiedSettings } from "@t3tools/contracts";
import { readCustomModelEntries } from "@t3tools/shared/model";
import { useGT } from "gt-react";
import { useState } from "react";

import { Button } from "../ui/button";
import { UsagePriceOverrides } from "../usage/UsagePriceOverrides";
import { useSearchableSetting } from "./settingsSearch";
import { FoldedSettingsSection } from "./FoldedSettingsSection";
import { SettingsRow } from "./settingsLayout";

export function ModelPricingSettings({
  environmentId,
  providers,
  settings,
  readOnly,
}: {
  readonly environmentId: EnvironmentId;
  readonly providers: readonly ServerProvider[];
  readonly settings: Pick<UnifiedSettings, "providerInstances" | "usagePriceOverrides">;
  readonly readOnly: boolean;
}) {
  const gt = useGT();
  const searchableSetting = useSearchableSetting();
  const [model, setModel] = useState<string | null>(null);
  const configured = Object.values(settings.providerInstances ?? {}).flatMap(({ config }) =>
    config !== null && typeof config === "object" && "customModels" in config
      ? readCustomModelEntries(config.customModels)
      : [],
  );
  const models = [
    ...new Map(
      [...providers.flatMap((provider) => provider.models), ...configured].map((entry) => [
        entry.slug,
        entry,
      ]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <FoldedSettingsSection
        id={searchableSetting("model-pricing").id}
        title={searchableSetting("model-pricing").title}
        headerPlacement="outside"
      >
        {models.length === 0 ? (
          <SettingsRow title={gt("No configured models.")} />
        ) : (
          models.map(({ slug, name }) => {
            const customized = Object.hasOwn(settings.usagePriceOverrides, slug);
            return (
              <SettingsRow
                key={slug}
                title={name}
                description={name === slug ? undefined : slug}
                status={customized ? gt("Custom price") : gt("Automatic")}
                control={
                  readOnly ? null : (
                    <Button
                      variant="outline"
                      size="xs"
                      aria-label={gt("Set price for {model}", { model: slug })}
                      onClick={() => setModel(slug)}
                    >
                      {customized ? gt("Edit price") : gt("Set price")}
                    </Button>
                  )
                }
              />
            );
          })
        )}
      </FoldedSettingsSection>
      {model !== null ? (
        <UsagePriceOverrides
          environmentId={environmentId}
          initialModel={model}
          onOpenChange={(open) => {
            if (!open) setModel(null);
          }}
        />
      ) : null}
    </>
  );
}
