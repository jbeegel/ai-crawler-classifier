import { describe, expect, it } from "vitest";
import { AI_PURPOSES, KNOWN_BOTS, PURPOSE_LABEL, classifyAiReferral, classifyBot, classifyRequest } from "../src/index.js";

const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

describe("classifyBot", () => {
  it("names the AI crawlers by vendor and purpose", () => {
    expect(classifyBot("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot")).toEqual({ bot: "GPTBot", vendor: "OpenAI", purpose: "ai-training" });
    expect(classifyBot("Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)")?.purpose).toBe("ai-assistant");
    expect(classifyBot("Mozilla/5.0 (compatible; OAI-SearchBot/1.0)")?.purpose).toBe("ai-search");
    expect(classifyBot("Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)")?.bot).toBe("ClaudeBot");
    expect(classifyBot("Claude-User/1.0")?.purpose).toBe("ai-assistant");
    expect(classifyBot("Mozilla/5.0 (compatible; PerplexityBot/1.0)")?.vendor).toBe("Perplexity");
    expect(classifyBot("meta-externalagent/1.1")?.vendor).toBe("Meta");
    expect(classifyBot("CCBot/2.0 (https://commoncrawl.org/faq/)")?.purpose).toBe("ai-training");
  });

  it("names search engines and SEO tools", () => {
    expect(classifyBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")?.purpose).toBe("search-engine");
    expect(classifyBot("Mozilla/5.0 (compatible; bingbot/2.0)")?.vendor).toBe("Microsoft");
    expect(classifyBot("Mozilla/5.0 (compatible; AhrefsBot/7.0)")?.purpose).toBe("seo-tool");
  });

  it("tells a vendor's agents apart", () => {
    expect(classifyBot("Mozilla/5.0 (compatible; Claude-SearchBot/1.0)")?.bot).toBe("Claude-SearchBot");
    expect(classifyBot("Mozilla/5.0 (compatible; Perplexity-User/1.0)")?.purpose).toBe("ai-assistant");
    expect(classifyBot("Mozilla/5.0 (compatible; Google-InspectionTool/1.0)")?.bot).toBe("Google-InspectionTool");
    expect(classifyBot("GoogleOther")?.purpose).toBe("ai-training");
    expect(classifyBot("meta-externalfetcher/1.1")?.purpose).toBe("ai-assistant");
    expect(classifyBot("DuckAssistBot/1.2")?.purpose).toBe("ai-assistant");
    expect(classifyBot("DuckDuckBot/1.1")?.purpose).toBe("search-engine");
  });

  it("ignores letter case", () => {
    expect(classifyBot("gptbot/1.2")?.bot).toBe("GPTBot");
  });

  it("leaves real browsers alone and buckets unknown bots", () => {
    expect(classifyBot(SAFARI)).toBeNull();
    expect(classifyBot(CHROME)).toBeNull();
    expect(classifyBot(null)).toBeNull();
    expect(classifyBot(undefined)).toBeNull();
    expect(classifyBot("")).toBeNull();
    expect(classifyBot("SomeNewCrawler/0.1")).toEqual({ bot: "Other bot", vendor: "Other", purpose: "other" });
    expect(classifyBot("curl/8.7.1")?.purpose).toBe("other");
  });

  it("matches each listed crawler to its own entry", () => {
    for (const known of KNOWN_BOTS) {
      if (/ /.test(known.bot) || known.bot === "Cohere") continue; // display names, not user agent tokens
      expect(classifyBot(`Mozilla/5.0 (compatible; ${known.bot}/1.0)`)).toEqual(known);
    }
  });

  it("has a label for every purpose", () => {
    for (const known of KNOWN_BOTS) expect(PURPOSE_LABEL[known.purpose]).toBeTruthy();
    for (const p of AI_PURPOSES) expect(PURPOSE_LABEL[p]).toBeTruthy();
  });
});

describe("classifyAiReferral", () => {
  it("recognizes visits from AI answers by referrer or utm_source", () => {
    expect(classifyAiReferral("https://chatgpt.com/", null)).toBe("ChatGPT");
    expect(classifyAiReferral(null, "chatgpt.com")).toBe("ChatGPT");
    expect(classifyAiReferral("https://www.perplexity.ai/search?q=x", null)).toBe("Perplexity");
    expect(classifyAiReferral("https://claude.ai/chat/abc", null)).toBe("Claude");
    expect(classifyAiReferral("https://gemini.google.com/app", null)).toBe("Gemini");
    expect(classifyAiReferral("https://copilot.microsoft.com/", null)).toBe("Copilot");
  });

  it("does not count ordinary referrers or bad input", () => {
    expect(classifyAiReferral("https://www.google.com/", null)).toBeNull();
    expect(classifyAiReferral("not a url", null)).toBeNull();
    expect(classifyAiReferral(null, null)).toBeNull();
    expect(classifyAiReferral(undefined)).toBeNull();
  });

  it("is not fooled by a host that only ends in a similar name", () => {
    expect(classifyAiReferral("https://notchatgpt.com/", null)).toBeNull();
    expect(classifyAiReferral("https://chatgpt.com.evil.test/", null)).toBeNull();
    expect(classifyAiReferral("https://evil.test/?from=chatgpt.com", null)).toBeNull();
  });
});

describe("classifyRequest", () => {
  it("returns a bot with its label and whether it is an AI system", () => {
    expect(classifyRequest({ userAgent: "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)" })).toEqual({
      kind: "bot",
      bot: "GPTBot",
      vendor: "OpenAI",
      purpose: "ai-training",
      label: "AI model training",
      isAi: true,
    });
    const google = classifyRequest({ userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" });
    expect(google).toMatchObject({ kind: "bot", purpose: "search-engine", isAi: false });
  });

  it("returns an AI referral for a browser that came from an assistant", () => {
    expect(classifyRequest({ userAgent: CHROME, referrer: "https://chatgpt.com/" })).toEqual({ kind: "ai-referral", source: "ChatGPT" });
    expect(classifyRequest({ userAgent: CHROME, url: "https://example.com/pricing?utm_source=chatgpt.com" })).toEqual({ kind: "ai-referral", source: "ChatGPT" });
    expect(classifyRequest({ userAgent: CHROME, url: "/pricing?utm_source=perplexity.ai" })).toEqual({ kind: "ai-referral", source: "Perplexity" });
    expect(classifyRequest({ userAgent: CHROME, utmSource: "claude.ai" })).toEqual({ kind: "ai-referral", source: "Claude" });
  });

  it("checks the user agent first, so a crawler with an AI referrer is still a crawler", () => {
    expect(classifyRequest({ userAgent: "Mozilla/5.0 (compatible; bingbot/2.0)", referrer: "https://chatgpt.com/" }).kind).toBe("bot");
  });

  it("returns none for an ordinary visit and for missing headers", () => {
    expect(classifyRequest({ userAgent: SAFARI, referrer: "https://www.google.com/" })).toEqual({ kind: "none" });
    expect(classifyRequest({ userAgent: SAFARI })).toEqual({ kind: "none" });
    expect(classifyRequest({})).toEqual({ kind: "none" });
    expect(classifyRequest({ userAgent: null, referrer: null, url: null })).toEqual({ kind: "none" });
  });
});
