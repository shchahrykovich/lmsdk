import { describe, it, expect } from "vitest";
import { parsePromptBody } from "../../../worker/execution/prompt-body";
import { buildExecuteRequest } from "../../../worker/execution/prompt-renderer";
import { parseResponseContent } from "../../../worker/execution/response-content";

const questions = {
  is_bug: { type: "noul", instructions: "Is it a bug?", criteria: { true: "Yes", false: "No" } },
};

describe("decision prompt bodies", () => {
  it("treats a body with decision questions as a JSON response", () => {
    const body = parsePromptBody(
      JSON.stringify({ messages: [{ role: "user", content: "{{ticket}}" }], decision_questions: questions })
    );

    expect(body).toEqual({
      messages: [{ role: "user", content: "{{ticket}}" }],
      decision_questions: questions,
      response_format: { type: "json" },
    });
  });

  it("keeps the stored response format when the body has no decision questions", () => {
    const body = parsePromptBody(JSON.stringify({ messages: [], response_format: { type: "text" } }));

    expect(body?.response_format).toEqual({ type: "text" });
  });

  it("ignores decision questions that are not an object", () => {
    const body = parsePromptBody(JSON.stringify({ messages: [], decision_questions: ["is_bug"] }));

    expect(body?.decision_questions).toBeUndefined();
    expect(body?.response_format).toBeUndefined();
  });

  it("passes the decision questions into the execute request", () => {
    const body = parsePromptBody(
      JSON.stringify({ messages: [{ role: "user", content: "{{ticket}}" }], decision_questions: questions })
    )!;

    const request = buildExecuteRequest({ model: "typesafe/jev-1.13", projectId: 3, slug: "triage" }, body, {
      ticket: "Blank page",
    });

    expect(request.decision_questions).toEqual(questions);
  });

  it("returns the answers of a decision run as an object", () => {
    const body = parsePromptBody(JSON.stringify({ messages: [], decision_questions: questions }))!;

    const response = parseResponseContent('{"is_bug":{"type":"noul","noul":0.96}}', body.response_format);

    expect(response).toEqual({ is_bug: { type: "noul", noul: 0.96 } });
  });
});
