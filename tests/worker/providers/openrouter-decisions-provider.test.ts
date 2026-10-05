import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenRouterDecisionsProvider } from "../../../worker/providers/openrouter-decisions-provider";
import { ProviderTimeoutError } from "../../../worker/providers/provider-timeout-error";
import type { DecisionQuestions, ExecuteRequest } from "../../../worker/providers/base-provider";
import { CapturingLogger } from "../helpers/capturing-logger";

const API_KEY = "sk-or-test-key";

const questions: DecisionQuestions = {
  is_bug: {
    type: "noul",
    instructions: "Is the customer reporting a software defect?",
    criteria: { true: "Broken behavior.", false: "A question or a feature request." },
  },
  team: {
    type: "choice",
    instructions: "Which team should own this ticket?",
    criteria: { frontend: "Rendering issues.", payments: "Checkout issues." },
  },
  urgency: {
    type: "score",
    instructions: "How urgent is this ticket?",
    criteria: ["Can wait", "This week", "Blocking revenue"],
  },
};

const answers = {
  is_bug: { type: "noul", noul: 0.96 },
  team: { type: "choice", choice: "payments", confidence: 0.75, probabilities: { frontend: 0.16, payments: 0.84 } },
  urgency: {
    type: "score",
    score: 1.99,
    confidence: 0.99,
    legend: { "0": "Can wait", "1": "This week", "2": "Blocking revenue" },
    probabilities: { "0": 0, "1": 0.01, "2": 0.99 },
  },
};

const decisionResponse = (overrides: Record<string, unknown> = {}) => ({
  id: "gen-dec-1",
  model: "typesafe/jev-1.13-20260917",
  provider: "TypeSafe",
  answers,
  usage: { input_tokens: 476, output_tokens: 70, cost: 0.000019992 },
  ...overrides,
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const baseRequest = (overrides: Partial<ExecuteRequest> = {}): ExecuteRequest => ({
  model: "typesafe/jev-1.13",
  messages: [{ role: "user", content: "My checkout page is blank after I click Pay." }],
  decision_questions: questions,
  ...overrides,
});

describe("OpenRouterDecisionsProvider", () => {
  let logger: CapturingLogger;
  let provider: OpenRouterDecisionsProvider;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const sentBody = () => JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body)) as Record<string, unknown>;

  beforeEach(() => {
    logger = new CapturingLogger();
    provider = new OpenRouterDecisionsProvider(API_KEY, logger);
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse(decisionResponse()));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("rejects an empty API key", () => {
    expect(() => new OpenRouterDecisionsProvider("", logger)).toThrow("API key is required");
  });

  it("reports its provider name", () => {
    expect(provider.getProviderName()).toBe("openrouter-decisions");
  });

  it("posts the questions and the user message as state to the decisions endpoint", async () => {
    await provider.execute(baseRequest());

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${API_KEY}`);
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(sentBody()).toEqual({
      model: "typesafe/jev-1.13",
      state: "My checkout page is blank after I click Pay.",
      questions,
    });
  });

  it("sends a user message that holds a JSON object as an object state", async () => {
    await provider.execute(
      baseRequest({ messages: [{ role: "user", content: '{"tier":"enterprise","ticket":"Blank page"}' }] })
    );

    expect(sentBody().state).toEqual({ tier: "enterprise", ticket: "Blank page" });
  });

  it("sends a user message that holds a JSON array as an array state", async () => {
    await provider.execute(baseRequest({ messages: [{ role: "user", content: '["first", "second"]' }] }));

    expect(sentBody().state).toEqual(["first", "second"]);
  });

  it("keeps a user message that is a bare JSON number as a string state", async () => {
    await provider.execute(baseRequest({ messages: [{ role: "user", content: "42" }] }));

    expect(sentBody().state).toBe("42");
  });

  it("does not send the system message", async () => {
    await provider.execute(
      baseRequest({
        messages: [
          { role: "system", content: "You are a router" },
          { role: "user", content: "Ticket text" },
        ],
      })
    );

    expect(sentBody().state).toBe("Ticket text");
  });

  it("joins several user messages into one state string", async () => {
    await provider.execute(
      baseRequest({
        messages: [
          { role: "user", content: "First part" },
          { role: "user", content: "Second part" },
        ],
      })
    );

    expect(sentBody().state).toBe("First part\n\nSecond part");
  });

  it("returns the answers as JSON content with usage and cost", async () => {
    const result = await provider.execute(baseRequest());

    expect(JSON.parse(result.content)).toEqual(answers);
    expect(result.model).toBe("typesafe/jev-1.13-20260917");
    expect(result.usage).toEqual({
      prompt_tokens: 476,
      completion_tokens: 70,
      total_tokens: 546,
      cost: 0.000019992,
    });
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("logs the request payload, the raw response, the result and success", async () => {
    const result = await provider.execute(baseRequest({ variables: { ticket: "x" } }));

    expect(logger.variables).toEqual([{ ticket: "x" }]);
    expect(logger.inputs).toEqual([
      { model: "typesafe/jev-1.13", state: "My checkout page is blank after I click Pay.", questions },
    ]);
    expect(logger.outputs).toEqual([decisionResponse()]);
    expect(logger.results).toEqual([result]);
    expect(logger.successes).toHaveLength(1);
    expect(logger.errors).toHaveLength(0);
  });

  it("fails without calling the API when the prompt has no questions", async () => {
    await expect(provider.execute(baseRequest({ decision_questions: undefined }))).rejects.toThrow(
      "Decisions need at least one question"
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logger.errors).toHaveLength(1);
  });

  it("fails without calling the API when the state is empty", async () => {
    await expect(
      provider.execute(baseRequest({ messages: [{ role: "system", content: "Only a system message" }] }))
    ).rejects.toThrow("Decisions need a state: add a user message");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws the OpenRouter error message and keeps the HTTP status for retries", async () => {
    fetchSpy.mockImplementation(async () => jsonResponse({ error: { code: 429, message: "Rate limit exceeded" } }, 429));

    const failure = await provider.execute(baseRequest()).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("OpenRouter Decisions error 429: Rate limit exceeded");
    expect((failure as { status?: number }).status).toBe(429);
    expect(logger.errors[0]?.errorMessage).toBe("OpenRouter Decisions error 429: Rate limit exceeded");
  });

  it("reports the HTTP status when the error body is not JSON", async () => {
    fetchSpy.mockImplementation(async () => new Response("Bad gateway", { status: 502 }));

    await expect(provider.execute(baseRequest())).rejects.toThrow("OpenRouter Decisions error 502: Bad gateway");
  });

  it("fails when a 200 response has no answers", async () => {
    fetchSpy.mockImplementation(async () => jsonResponse(decisionResponse({ answers: undefined })));

    await expect(provider.execute(baseRequest())).rejects.toThrow("OpenRouter Decisions response has no answers");
  });

  it("turns a fetch timeout into a ProviderTimeoutError", async () => {
    fetchSpy.mockImplementation(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });

    const failure = await provider.execute(baseRequest()).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ProviderTimeoutError);
    expect((failure as ProviderTimeoutError).providerName).toBe("OpenRouter Decisions");
  });
});
