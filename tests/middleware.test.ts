import { describe, expect, it } from "vitest";
import { withAiVisibility } from "../examples/middleware.js";
import type { Classification } from "../src/index.js";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function run(headers: Record<string, string>, url = "https://example.com/services") {
  const hits: { path: string; result: Classification }[] = [];
  const handler = withAiVisibility(
    () => new Response("ok"),
    (hit) => {
      hits.push(hit);
    },
  );
  const response = await handler(new Request(url, { headers }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { hits, body: await response.text() };
}

describe("fetch-style middleware example", () => {
  it("records a crawler and still serves the page", async () => {
    const { hits, body } = await run({ "user-agent": "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)" });
    expect(body).toBe("ok");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ path: "/services", result: { kind: "bot", bot: "ClaudeBot", isAi: true } });
  });

  it("records an AI referral only on a page view", async () => {
    const referred = { "user-agent": CHROME, referer: "https://chatgpt.com/" };
    expect((await run({ ...referred, "sec-fetch-dest": "document" })).hits).toMatchObject([{ result: { kind: "ai-referral", source: "ChatGPT" } }]);
    expect((await run({ ...referred, "sec-fetch-dest": "image" })).hits).toEqual([]);
  });

  it("records nothing for an ordinary visit", async () => {
    expect((await run({ "user-agent": CHROME, "sec-fetch-dest": "document" })).hits).toEqual([]);
  });

  it("serves the page even when recording fails", async () => {
    const handler = withAiVisibility(
      () => new Response("ok"),
      () => {
        throw new Error("database is down");
      },
    );
    const response = await handler(new Request("https://example.com/", { headers: { "user-agent": "GPTBot/1.2" } }));
    expect(await response.text()).toBe("ok");
  });
});
