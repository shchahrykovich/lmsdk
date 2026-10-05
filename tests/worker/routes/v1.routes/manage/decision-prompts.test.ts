import { describe, it, expect, beforeEach } from "vitest";
import { manage, setupFixtures, type Fixtures } from "./helpers";

type PromptResponse = {
  prompt: { slug: string; provider: string; model: string };
  version: { version: number; body: Record<string, unknown> };
};

const questions = {
  is_bug: {
    type: "noul",
    instructions: "Is the customer reporting a software defect?",
    criteria: { true: "Broken behavior.", false: "A question." },
  },
  team: {
    type: "choice",
    instructions: "Which team should own this ticket?",
    criteria: { frontend: "Rendering issues.", payments: "Checkout issues." },
  },
  urgency: { type: "score", instructions: "How urgent is it?", criteria: ["Can wait", "This week", "Now"] },
};

const decisionPrompt = (decisionQuestions: unknown) => ({
  name: "Ticket triage",
  slug: "ticket-triage",
  provider: "openrouter-decisions",
  model: "typesafe/jev-1.13",
  body: { messages: [{ role: "user", content: "{{ticket}}" }], decision_questions: decisionQuestions },
});

const createPrompt = (key: string, body: Record<string, unknown>) =>
  manage("/projects/support/prompts", key, { method: "POST", body });

describe("Manage API - decision prompts", () => {
  let f: Fixtures;

  beforeEach(async () => {
    f = await setupFixtures();
  });

  it("stores the decision questions of a new decision prompt", async () => {
    const res = await createPrompt(f.keys.write, decisionPrompt(questions));
    const body = await res.json<PromptResponse>();

    expect(res.status).toBe(201);
    expect(body.prompt).toMatchObject({ provider: "openrouter-decisions", model: "typesafe/jev-1.13" });
    expect(body.version.body.decision_questions).toEqual(questions);
  });

  it("returns 400 for a question with an unknown type", async () => {
    const res = await createPrompt(f.keys.write, decisionPrompt({ q: { type: "bool", instructions: "x", criteria: {} } }));

    expect(res.status).toBe(400);
  });

  it("returns 400 for a score question with criteria that are not a list", async () => {
    const res = await createPrompt(
      f.keys.write,
      decisionPrompt({ q: { type: "score", instructions: "x", criteria: { low: "Low" } } })
    );

    expect(res.status).toBe(400);
  });
});
