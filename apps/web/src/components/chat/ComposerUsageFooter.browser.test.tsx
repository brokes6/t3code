import { deriveLatestContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type ServerProvider,
  type ServerProviderUsageWindow,
} from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import stylesheet from "~/index.css?inline";
import { render } from "../../../test/render";
import { ComposerUsageFooter } from "./ComposerUsageFooter";

it("keeps context on the left and omits an unreported 5h quota on the right", async () => {
  const style = document.createElement("style");
  style.textContent = stylesheet;
  document.head.append(style);
  using _style = { [Symbol.dispose]: () => style.remove() };
  await page.viewport(400, 700);

  const checkedAt = "2026-10-25T16:00:00.000Z";
  const providerInstanceId = ProviderInstanceId.make("footer-codex");
  const contextWindow = deriveLatestContextWindowSnapshot([], {
    updatedAt: checkedAt,
    usedTokens: 277_000,
    maxTokens: 1_000_000,
  });
  const weekly = { id: "weekly", kind: "weekly", label: "Weekly", usedPercent: 54 } as const;
  const session = {
    id: "session",
    kind: "session",
    label: "Session",
    windowDurationMins: 300,
    usedPercent: 6,
  } as const;
  function footer(windows: readonly ServerProviderUsageWindow[]) {
    const provider = {
      instanceId: providerInstanceId,
      driver: ProviderDriverKind.make("codex"),
      enabled: true,
      installed: true,
      version: "0.164.0",
      status: "ready",
      auth: { status: "authenticated" },
      checkedAt,
      models: [],
      slashCommands: [],
      skills: [],
      usageLimits: { checkedAt, windows },
    } satisfies ServerProvider;
    return (
      <ComposerUsageFooter
        usage={{
          providerInstanceId,
          model: null,
          providers: [provider],
          sources: [],
          contextWindow,
        }}
        turns={[]}
        attempts={[]}
        threadId={ThreadId.make("footer-thread")}
        hasMoreHistory={false}
        environmentId={EnvironmentId.make("footer-environment")}
        activeProviderThread={undefined}
      />
    );
  }

  const additional = { ...weekly, id: "extra", kind: "other", label: "Extra quota" } as const;
  await using screen = await render(footer([session, weekly, additional]));
  const context = screen.getByRole("button", { name: "Context: 28% used" });
  const limits = screen.getByRole("button", { name: /Weekly: 46% left/ });
  await expect.element(context.getByText("277k/1m")).toBeVisible();
  await expect.element(limits.getByText("5h", { exact: true })).toBeVisible();
  await expect.element(limits.getByText("7d", { exact: true })).toBeVisible();
  await expect.element(limits.getByText("+1", { exact: true })).toBeVisible();
  expect(context.element().getBoundingClientRect().right).toBeLessThan(
    limits.element().getBoundingClientRect().left,
  );

  await screen.rerender(footer([weekly]));
  await expect.element(limits.getByText("5h", { exact: true })).not.toBeInTheDocument();
  await expect.element(limits.getByText("7d", { exact: true })).toBeVisible();
  await limits.click();
  await expect.element(page.getByRole("dialog", { name: "Usage limits" })).toBeVisible();
});
