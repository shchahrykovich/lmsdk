import { describe, it, expect, beforeEach } from "vitest";
import { manage, setupFixtures, type Fixtures } from "./helpers";

const DECISIONS = { provider: "openrouter-decisions", model: "typesafe/jev-1.13" };
const messages = [{ role: "user", content: "{{ticket}}" }];
const isBug = {
  type: "noul",
  instructions: "Is the customer reporting a software defect?",
  criteria: { true: "Broken behavior.", false: "A question." },
};

const createDecisionPrompt = (key: string, body: Record<string, unknown>) =>
  manage("/projects/support/prompts", key, {
    method: "POST",
    body: { name: "Ticket triage", slug: "ticket-triage", ...DECISIONS, body },
  });

describe("Manage API - decision prompts that cannot run", () => {
  let f: Fixtures;

  beforeEach(async () => {
    f = await setupFixtures();
  });

  it("returns 400 for a decision prompt without questions", async () => {
    const res = await createDecisionPrompt(f.keys.write, { messages });

    expect(res.status).toBe(400);
  });

  it("returns 400 for a decision prompt with an empty question map", async () => {
    const res = await createDecisionPrompt(f.keys.write, { messages, decision_questions: {} });

    expect(res.status).toBe(400);
  });

  it("returns 400 for a choice question with one option", async () => {
    const res = await createDecisionPrompt(f.keys.write, {
      messages,
      decision_questions: { team: { type: "choice", instructions: "Which team?", criteria: { payments: "Checkout." } } },
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for a yes/no question with an empty criterion", async () => {
    const res = await createDecisionPrompt(f.keys.write, {
      messages,
      decision_questions: { is_bug: { ...isBug, criteria: { true: "", false: "A question." } } },
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when a new version switches to decisions but keeps a body without questions", async () => {
    const res = await manage("/projects/support/prompts/classifier/versions", f.keys.write, {
      method: "POST",
      body: DECISIONS,
    });

    expect(res.status).toBe(400);
  });

  it("accepts a new decisions version whose body has questions", async () => {
    const res = await manage("/projects/support/prompts/classifier/versions", f.keys.write, {
      method: "POST",
      body: { ...DECISIONS, body: { messages, decision_questions: { is_bug: isBug } } },
    });

    expect(res.status).toBe(201);
  });
});
