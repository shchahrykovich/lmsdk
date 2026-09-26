import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import type { WorkflowStep } from "cloudflare:workers";
import { runEvaluationWorkflow, type EvaluationWorkflowParams } from "../../../../../worker/workflows/evaluation.workflow";
import type { ExecutePromptRequest } from "../../../../../worker/services/provider.service";
import { requestJsonWithApiKey } from "../helpers";
import { createWorkflowMock, manage, MODEL, setupFixtures, type Fixtures } from "./helpers";

vi.mock("../../../../../worker/services/provider.service", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../../../worker/services/provider.service")>();
  class FakeModelProviderService extends original.ProviderService {
    async executePrompt(_provider: string, request: ExecutePromptRequest) {
      const label = request.messages[0].content.split(":")[0];
      const ticket = (request.variables as { ticket?: string } | undefined)?.ticket;
      return { content: `${label}:${ticket}`, model: request.model, duration_ms: 5, usage: undefined };
    }
  }
  return { ...original, ProviderService: FakeModelProviderService };
});

const fakeStep = {
  do: async (_name: string, ...args: unknown[]) => {
    const callback = args[args.length - 1] as () => Promise<unknown>;
    return await callback();
  },
} as unknown as WorkflowStep;

const runWorkflow = async (params: EvaluationWorkflowParams) =>
  await runEvaluationWorkflow(params, fakeStep, {
    db: env.DB,
    cache: env.CACHE,
    providerConfig: { openAIKey: "x", geminiKey: "x", cloudflareAiGatewayToken: "x", cloudflareAiGatewayBaseUrl: "x" },
  });

type EvaluationDetails = {
  evaluation: { state: string };
  results: { variables: { ticket: string }; outputs: { versionId: number; result: { content: string } }[] }[];
};

describe("E1. Agent loop through the management API", () => {
  let f: Fixtures;

  beforeEach(async () => {
    f = await setupFixtures();
  });

  it("builds, evaluates, compares and activates a prompt without touching production until the last step", async () => {
    const key = f.keys.write;
    const workflow = createWorkflowMock();
    const execute = async () => {
      const res = await requestJsonWithApiKey("/api/v1/projects/agent-project/prompts/router/execute", key, {
        variables: { ticket: "Refund" },
      });
      return (await res.json<{ response: string }>()).response;
    };
    const post = (path: string, body: unknown) => manage(path, key, { method: "POST", body, workflow });

    const providers = await (await manage("/providers", key)).json<{ providers: { id: string; models: { id: string }[] }[] }>();
    expect(providers.providers[0].models.map((m) => m.id)).toContain(MODEL);

    expect((await post("/projects", { name: "Agent project", slug: "agent-project" })).status).toBe(201);

    const promptRes = await post("/projects/agent-project/prompts", {
      name: "Router",
      slug: "router",
      provider: "openai",
      model: MODEL,
      body: { messages: [{ role: "user", content: "v1: route {{ticket}}" }] },
    });
    expect(promptRes.status).toBe(201);
    expect(await execute()).toBe("v1:Refund");

    expect((await post("/projects/agent-project/datasets", { name: "Tickets" })).status).toBe(201);
    const records = await post("/projects/agent-project/datasets/tickets/records", {
      records: [{ ticket: "Refund" }, { ticket: "Crash" }, { ticket: "Invoice" }],
    });
    expect(records.status).toBe(201);

    expect((await post("/projects/agent-project/evaluations", {
      name: "Baseline",
      dataset: "tickets",
      prompts: [{ prompt: "router", version: 1 }],
    })).status).toBe(201);
    await runWorkflow(workflow.create.mock.calls[0][0].params as EvaluationWorkflowParams);

    const baseline = await (await manage("/projects/agent-project/evaluations/baseline", key, { workflow })).json<EvaluationDetails>();
    expect(baseline.evaluation.state).toBe("finished");
    expect(baseline.results.map((r) => r.outputs[0].result.content).sort()).toEqual(["v1:Crash", "v1:Invoice", "v1:Refund"]);

    const versionRes = await post("/projects/agent-project/prompts/router/versions", {
      body: { messages: [{ role: "user", content: "v2: route {{ticket}}" }] },
    });
    expect(versionRes.status).toBe(201);
    expect(await execute()).toBe("v1:Refund");

    expect((await post("/projects/agent-project/evaluations", {
      name: "Compare",
      dataset: "tickets",
      prompts: [
        { prompt: "router", version: 1 },
        { prompt: "router", version: 2 },
      ],
    })).status).toBe(201);
    await runWorkflow(workflow.create.mock.calls[1][0].params as EvaluationWorkflowParams);

    const compare = await (await manage("/projects/agent-project/evaluations/compare", key, { workflow })).json<EvaluationDetails>();
    expect(compare.evaluation.state).toBe("finished");
    const refund = compare.results.find((r) => r.variables.ticket === "Refund")!;
    expect(refund.outputs.map((o) => o.result.content).sort()).toEqual(["v1:Refund", "v2:Refund"]);

    const activate = await manage("/projects/agent-project/prompts/router/active-version", key, {
      method: "PUT",
      body: { version: 2 },
    });
    expect(activate.status).toBe(200);
    expect(await execute()).toBe("v2:Refund");
  });
});
