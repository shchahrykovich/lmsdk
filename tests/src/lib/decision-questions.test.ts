import { describe, expect, it } from "vitest";
import {
  DECISION_QUESTIONS_EXAMPLE,
  formatDecisionQuestions,
  parseDecisionQuestions,
} from "../../../src/lib/decision-questions";

const valid = {
  is_bug: { type: "noul", instructions: "Is it a bug?", criteria: { true: "Broken", false: "Question" } },
  team: { type: "choice", instructions: "Which team?", criteria: { frontend: "UI", payments: "Checkout" } },
  urgency: { type: "score", instructions: "How urgent?", criteria: ["Later", "Now"] },
};

const errorOf = (value: unknown) => {
  const result = parseDecisionQuestions(JSON.stringify(value));
  return "error" in result ? result.error : null;
};

describe("parseDecisionQuestions", () => {
  it("accepts the three question types", () => {
    expect(parseDecisionQuestions(JSON.stringify(valid))).toEqual({ questions: valid });
  });

  it("accepts the example shown in the editor", () => {
    expect(parseDecisionQuestions(DECISION_QUESTIONS_EXAMPLE)).toHaveProperty("questions");
  });

  it("rejects text that is not JSON", () => {
    expect(parseDecisionQuestions("{ not json")).toEqual({ error: "Questions must be valid JSON" });
  });

  it.each([[[]], [null], ["text"], [{}]])("rejects %j as the question map", (value) => {
    expect(errorOf(value)).toBe("Questions must be a JSON object with at least one question");
  });

  it("rejects an unknown question type and names the question", () => {
    expect(errorOf({ q1: { type: "bool", instructions: "x", criteria: {} } })).toBe(
      'Question "q1": type must be "noul", "choice" or "score"'
    );
  });

  it("rejects a question without instructions", () => {
    expect(errorOf({ q1: { type: "noul", instructions: " ", criteria: { true: "a", false: "b" } } })).toBe(
      'Question "q1": instructions are required'
    );
  });

  it("rejects a yes/no question without both true and false descriptions", () => {
    expect(errorOf({ q1: { type: "noul", instructions: "x", criteria: { true: "a" } } })).toBe(
      'Question "q1": criteria must have "true" and "false" descriptions'
    );
  });

  it("rejects a choice question with fewer than two options", () => {
    expect(errorOf({ q1: { type: "choice", instructions: "x", criteria: { only: "a" } } })).toBe(
      'Question "q1": criteria must map at least two option keys to descriptions'
    );
  });

  it("rejects a score question whose criteria are not a list of at least two levels", () => {
    expect(errorOf({ q1: { type: "score", instructions: "x", criteria: { low: "a", high: "b" } } })).toBe(
      'Question "q1": criteria must be a list of at least two levels'
    );
  });
});

describe("formatDecisionQuestions", () => {
  it("formats the questions of a saved body as indented JSON", () => {
    expect(formatDecisionQuestions({ decision_questions: valid })).toBe(JSON.stringify(valid, null, 2));
  });

  it("returns an empty string when the body has no questions", () => {
    expect(formatDecisionQuestions({ messages: [] })).toBe("");
    expect(formatDecisionQuestions(null)).toBe("");
  });
});
