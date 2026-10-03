import { vi } from "vitest";

export interface RecordedCall {
  method: string;
  url: string;
  headers: Headers;
  body: string;
}

export type Route = (call: RecordedCall) => Response | Promise<Response> | undefined;

export const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const bodyText = async (input: RequestInfo | URL, init?: RequestInit): Promise<string> => {
  if (input instanceof Request) return await input.clone().text();
  const body = init?.body;
  if (body === undefined || body === null) return "";
  if (typeof body === "string") return body;
  return await new Response(body).text();
};

export function routeFetch(routes: Route[]) {
  const calls: RecordedCall[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : null;
    const call: RecordedCall = {
      method: (init?.method ?? request?.method ?? "GET").toUpperCase(),
      url: request ? request.url : String(input),
      headers: new Headers(init?.headers ?? request?.headers),
      body: await bodyText(input, init),
    };
    calls.push(call);
    for (const route of routes) {
      const response = await route(call);
      if (response) return response;
    }
    throw new Error(`No recorded response for ${call.method} ${call.url}`);
  });
  return { calls, spy };
}

export const when =
  (method: string, pattern: RegExp, respond: (call: RecordedCall) => Response | Promise<Response>): Route =>
  (call) =>
    call.method === method && pattern.test(call.url) ? respond(call) : undefined;
