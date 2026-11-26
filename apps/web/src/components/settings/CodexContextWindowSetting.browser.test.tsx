import type { ServerProviderModel } from "@t3tools/contracts";
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";
import { CodexContextWindowSetting } from "./CodexContextWindowSetting";

const models = [
  { slug: "gpt-6.2-astra", name: "GPT-6.2 Astra", isCustom: false, capabilities: null },
  { slug: "custom-model", name: "Custom model", isCustom: true, capabilities: null },
] satisfies ServerProviderModel[];

it("saves a model's token limit and restores its default without touching another model", async () => {
  const save = vi.fn();
  function Fixture() {
    const [stored, setStored] = useState<Readonly<Record<string, number>>>({
      "custom-model": 200_000,
    });
    return (
      <CodexContextWindowSetting
        models={models}
        stored={stored}
        disabled={false}
        onSave={async (next) => {
          save(next);
          setStored(next);
          return true;
        }}
      />
    );
  }
  await using screen = await render(<Fixture />);
  await screen.getByRole("button", { name: "Configure" }).click();
  const size = screen.getByRole("combobox", { name: "Context window (tokens)" });
  await expect.element(size).toHaveTextContent("200,000");
  await screen.getByRole("combobox", { name: "Model" }).click();
  await screen.getByRole("option", { name: "GPT-6.2 Astra" }).click();
  await size.click();
  await screen.getByRole("option", { name: "512K", exact: true }).click();
  expect(save).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "Save", exact: true }).click();
  await expect.element(screen.getByRole("status")).toHaveTextContent("Saved");
  await expect.element(size).toHaveTextContent("512K");
  expect(save).toHaveBeenLastCalledWith({
    "gpt-6.2-astra": 512_000,
    "custom-model": 200_000,
  });

  await size.click();
  await screen.getByRole("option", { name: "Model default", exact: true }).click();
  await screen.getByRole("button", { name: "Save", exact: true }).click();
  await expect.element(screen.getByRole("status")).toHaveTextContent("Saved");
  await expect.element(size).toHaveTextContent("Model default");
  expect(save).toHaveBeenLastCalledWith({ "custom-model": 200_000 });
});
