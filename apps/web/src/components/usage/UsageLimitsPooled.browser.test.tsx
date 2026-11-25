import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  UsageLimitSourceId,
  type ServerProvider,
  type UsageLimitSourceSnapshot,
} from "@t3tools/contracts";
import { CHATGPT_USAGE_URL } from "@t3tools/shared/usageLimits";
import { describe, expect, it } from "vite-plus/test";

import "~/index.css";

import { render } from "../../../test/render";
import { UsageLimitsPooled } from "./UsageLimitsPooled";

const checkedAt = "2026-10-25T16:00:00.000Z";

function managedChatGpt(instanceId: string, displayName: string): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(instanceId),
    driver: ProviderDriverKind.make("codex"),
    displayName,
    enabled: true,
    installed: true,
    version: "0.164.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt,
    models: [],
    slashCommands: [],
    skills: [],
    usageLimits: {
      checkedAt,
      windows: [],
      unavailable: { reason: "unsupported", message: "Track usage in ChatGPT." },
      externalUsage: { label: "ChatGPT usage", url: CHATGPT_USAGE_URL },
    },
  };
}

it("shows a local spend budget alongside a self-hosted HTTP quota", async () => {
  const provider: ServerProvider = {
    ...managedChatGpt("third_party", "Third-party API"),
    usageLimits: {
      checkedAt,
      windows: [
        {
          id: "spend-budget",
          kind: "monthly",
          label: "Monthly budget",
          usedPercent: 25,
          spend: { usedUsd: 5, limitUsd: 20 },
        },
      ],
    },
  };
  const source: UsageLimitSourceSnapshot = {
    id: UsageLimitSourceId.make("quota"),
    kind: "http",
    label: "Self-hosted quota",
    checkedAt,
    accounts: [],
    quotaAccounts: [
      {
        id: "plan",
        label: "Shared plan",
        providerInstanceId: provider.instanceId,
        windows: [{ id: "weekly", kind: "weekly", label: "Weekly", usedPercent: 40 }],
      },
    ],
  };
  const presentations = new Map([
    [
      EnvironmentId.make("desk"),
      {
        entry: { target: { label: "Desk" } },
        serverConfig: { providers: [provider], usageLimitSources: [source] },
      },
    ],
  ]);
  await using screen = await render(
    <UsageLimitsPooled presentations={presentations} now={Date.parse(checkedAt)} />,
  );

  await expect.element(screen.getByText("Third-party API")).toBeVisible();
  await expect.element(screen.getByText("Monthly budget")).toBeVisible();
  await expect.element(screen.getByText("Self-hosted quota")).toBeVisible();
  await expect.element(screen.getByText("Shared plan")).toBeVisible();
});

describe("UsageLimitsPooled ChatGPT usage card", () => {
  it("names the managed connections it covers", async () => {
    const presentations = new Map([
      [
        EnvironmentId.make("desk"),
        {
          entry: { target: { label: "Desk" } },
          serverConfig: {
            providers: [
              managedChatGpt("chatgpt_work", "ChatGPT Work"),
              managedChatGpt("chatgpt_personal", "ChatGPT Personal"),
            ],
          },
        },
      ],
    ]);
    await using screen = await render(
      <UsageLimitsPooled presentations={presentations} now={Date.parse(checkedAt)} />,
    );

    await expect
      .element(screen.getByText("ChatGPT Work on Desk, ChatGPT Personal on Desk"))
      .toBeVisible();
    await expect
      .element(screen.getByText("View usage in ChatGPT with your connected account."))
      .toBeVisible();
  });
});

describe("UsageLimitsPooled next refill", () => {
  it("skips elapsed resets while waiting for refreshed account data", async () => {
    function account(instanceId: string, usedPercent: number, resetsAt: string): ServerProvider {
      return {
        ...managedChatGpt(instanceId, instanceId),
        usageLimits: {
          checkedAt,
          windows: [{ id: "weekly", label: "Weekly", kind: "weekly", usedPercent, resetsAt }],
        },
      };
    }
    const presentations = new Map([
      [
        EnvironmentId.make("desk"),
        {
          entry: { target: { label: "Desk" } },
          serverConfig: {
            providers: [
              account("Work", 20, "2026-10-25T17:00:00.000Z"),
              account("Personal", 60, "2026-10-25T18:00:00.000Z"),
            ],
          },
        },
      ],
    ]);
    await using screen = await render(
      <UsageLimitsPooled presentations={presentations} now={Date.parse("2026-10-25T17:30:00Z")} />,
    );
    await expect.element(screen.getByText("↻ +30%", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("↻ +30% in 30m")).toBeVisible();

    await screen.rerender(
      <UsageLimitsPooled presentations={presentations} now={Date.parse("2026-10-25T18:00:00Z")} />,
    );
    await expect.element(screen.getByText(/^↻ \+\d+%$/)).not.toBeInTheDocument();
  });
});
