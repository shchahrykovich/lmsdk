import { describe, it, expect } from "vitest";
import { parsePromptBody } from "../../../worker/execution/prompt-body";
import { buildExecuteRequest, renderExecuteRequest, renderMessages } from "../../../worker/execution/prompt-renderer";
import { parseResponseContent } from "../../../worker/execution/response-content";

describe("parsePromptBody", () => {
  it("returns the body with an empty message list when messages are missing", () => {
    expect(parsePromptBody('{"response_format":{"type":"json"}}')).toEqual({
      response_format: { type: "json" },
      messages: [],
    });
  });

  it.each([[""], ["not json"], ["null"]])("returns null for %j", (raw) => {
    expect(parsePromptBody(raw)).toBeNull();
  });
});

describe("prompt rendering", () => {
  const body = {
    messages: [
      { role: "system" as const, content: "Extract the protocol." },
      { role: "user" as const, content: "{{article.title}}: {{article.text}}" },
    ],
    response_format: { type: "json" as const },
    openai_settings: { reasoning_effort: "low" as const },
  };
  const version = { model: "gpt-6-luna", projectId: 7, slug: "extract-protocol" };

  it("builds the execute request from the version, the body and the variables", () => {
    const request = buildExecuteRequest(version, body, { article: { title: "T", text: "X" } });

    expect(request).toMatchObject({
      model: "gpt-6-luna",
      projectId: 7,
      promptSlug: "extract-protocol",
      response_format: { type: "json" },
      openai_settings: { reasoning_effort: "low" },
    });
  });

  it("substitutes variables only when the request is rendered", () => {
    const request = buildExecuteRequest(version, body, { article: { title: "T", text: "X" } });

    expect(request.messages[1]?.content).toBe("{{article.title}}: {{article.text}}");
    expect(renderExecuteRequest(request).messages[1]?.content).toBe("T: X");
  });

  it("keeps the messages unchanged when there are no variables", () => {
    expect(renderMessages(body.messages)).toBe(body.messages);
  });
});

describe("parseResponseContent", () => {
  it("parses JSON when the prompt asks for JSON", () => {
    expect(parseResponseContent('{"a":1}', { type: "json_schema", json_schema: {} })).toEqual({ a: 1 });
  });

  it("returns the text when JSON was asked for but the answer is not JSON", () => {
    expect(parseResponseContent("sorry", { type: "json" })).toBe("sorry");
  });

  it("returns the text for a text prompt even when it looks like JSON", () => {
    expect(parseResponseContent('{"a":1}', { type: "text" })).toBe('{"a":1}');
  });
});
