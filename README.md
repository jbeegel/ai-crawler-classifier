# ai-crawler-classifier

A small TypeScript function that classifies a web request as a search crawler, an AI crawler (training, search index or a live fetch for someone's question) or a human visit referred by an AI assistant, using only the user agent and the referrer.

## Who it is for

- Site owners and marketers who want to know which AI systems read their site and which AI answers send people to it.
- Developers adding that view to a dashboard, a log pipeline or a middleware, who want one pure function instead of a service.
- Anyone doing AI search visibility work who needs a baseline before changing content.

## Why a site owner would want this

Standard web analytics runs in the visitor's browser. Crawlers do not run that script, so they are invisible there. That hides two things worth knowing:

1. **Which AI systems read the site, and for what.** A training crawler collecting pages for a future model, a crawler building an AI search index, and a fetch made right now because a person asked an assistant a question are three different events. The third one means your page was pulled into a live answer.
2. **Which answers send visitors.** When someone clicks a link inside an AI answer, the visit arrives with that assistant's hostname as the referrer, or with a `utm_source` the assistant appended. Most analytics tools file these under generic referral traffic.

Classifying requests on the server, before the page cache, makes both visible. You can then see which pages AI systems fetch most, whether that changes after you publish, and which assistants send people.

## What it does

- `classifyRequest({ userAgent, referrer, url })` returns one of three results: a bot (with name, vendor and purpose), an AI referral (with the assistant's name), or none.
- Sorts bots into six purposes: AI model training, AI search index, live AI answer, search engine, SEO tool, and other.
- Recognizes 29 named crawlers from OpenAI, Anthropic, Perplexity, Google, Microsoft, Apple, Meta, Common Crawl, ByteDance, Amazon, DuckDuckGo, Mistral, Cohere, You.com, Yandex, Baidu, Ahrefs, Semrush, Majestic and Moz.
- Recognizes referrals from ChatGPT, Perplexity, Claude, Gemini, Copilot, You.com, DeepSeek and Meta AI.
- Buckets an unlisted user agent that reads like automation as "Other bot".
- Has no dependencies, makes no network calls and keeps no state, so it is cheap enough to run on every request.

## Quick start

Requires Node 20 or later.

```bash
git clone <this repository>
cd ai-crawler-classifier
npm install
npm run example
```

`examples/quick-start.ts`:

```ts
import { classifyRequest } from "../src/index.js";

const browser = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const requests = [
  { userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot" },
  { userAgent: "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)" },
  { userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
  { userAgent: browser, referrer: "https://www.perplexity.ai/search?q=best+accountant+near+me" },
  { userAgent: browser, url: "https://example.com/pricing?utm_source=chatgpt.com" },
  { userAgent: browser, referrer: "https://www.google.com/" },
];

for (const request of requests) console.log(JSON.stringify(classifyRequest(request)));
```

Output:

```text
{"kind":"bot","bot":"GPTBot","vendor":"OpenAI","purpose":"ai-training","label":"AI model training","isAi":true}
{"kind":"bot","bot":"ChatGPT-User","vendor":"OpenAI","purpose":"ai-assistant","label":"Live AI answer","isAi":true}
{"kind":"bot","bot":"Googlebot","vendor":"Google","purpose":"search-engine","label":"Search engine","isAi":false}
{"kind":"ai-referral","source":"Perplexity"}
{"kind":"ai-referral","source":"ChatGPT"}
{"kind":"none"}
```

## Using it in a middleware

`examples/middleware.ts` wraps any fetch-style handler (a function from `Request` to `Response`). That shape works in Cloudflare Workers, Deno, Bun and Hono, and maps directly onto Next.js middleware.

```ts
import { classifyRequest, type Classification } from "ai-crawler-classifier";

export function withAiVisibility(
  handler: (request: Request) => Response | Promise<Response>,
  record: (hit: { path: string; result: Classification }) => void | Promise<void>,
) {
  return async (request: Request): Promise<Response> => {
    const result = classifyRequest({
      userAgent: request.headers.get("user-agent"),
      referrer: request.headers.get("referer"),
      url: request.url,
    });

    // Count a referral once per page view, not once per image and script.
    const isPageView = request.headers.get("sec-fetch-dest") === "document";

    if (result.kind === "bot" || (result.kind === "ai-referral" && isPageView)) {
      const path = new URL(request.url).pathname;
      Promise.resolve()
        .then(() => record({ path, result }))
        .catch(() => {});
    }

    return handler(request);
  };
}
```

`record` is yours to write: a database insert, a log line, a queue message. It is not awaited, so a slow or failing write never delays or breaks the page. On a serverless platform, pass that promise to the platform's `waitUntil` so the write finishes after the response is sent.

Three practical notes:

- Run it before your page cache or CDN cache, or cached pages will never be counted.
- Store only what you need. Bot name, purpose, path and date are enough for a useful report. Nothing here requires storing IP addresses or anything about a person.
- Normalize paths that contain tokens or IDs before you store them.

## How it works

**Bots.** The user agent is tested against an ordered list of case-insensitive patterns, one per crawler. Order matters: specific agents come before their families, so `Claude-SearchBot` is not reported as `ClaudeBot`, and `Google-InspectionTool` is not reported as `Googlebot`. If nothing on the list matches, a generic pattern (words such as `bot`, `crawler`, `spider`, `headless`, `curl/`) puts the request in "Other bot". Anything else is treated as a person's browser.

**Purposes.**

| Purpose | Label | What it means |
|---|---|---|
| `ai-training` | AI model training | Collecting pages that may be used to train a model |
| `ai-search` | AI search index | Building the index an AI search product answers from |
| `ai-assistant` | Live AI answer | Fetching a page right now because a person asked an assistant something |
| `search-engine` | Search engine | A conventional search crawler |
| `seo-tool` | SEO tool | A third-party SEO product's crawler |
| `other` | Other bot | Automation that is not on the list |

**AI referrals.** Only when the user agent looks like a browser, the hostname of the referrer is tested against a list of assistant hostnames, anchored so that `notchatgpt.com` and `chatgpt.com.example.test` do not match. The `utm_source` value is tested the same way, because some assistants append it (ChatGPT adds `utm_source=chatgpt.com`) and the referrer is often missing.

**Precedence.** User agent first. A crawler is reported as a crawler whatever its referrer says.

### Limits

- **A user agent is a claim, not proof.** Anyone can send `GPTBot` as a user agent. This library does not verify crawlers by IP range or reverse DNS. Use it to observe and report, not to grant or deny access.
- **The list goes stale.** Vendors add and rename crawlers. The list reflects what was known when it was last edited, and an unlisted AI crawler lands in "Other bot" or, if its user agent looks like a browser, is missed entirely. `KNOWN_BOTS` exports the list so you can see exactly what is covered.
- **Purposes are a simplification.** Each crawler gets one purpose based on how its vendor describes it. Some crawlers serve more than one use, and vendors change what they do with what they collect.
- **The generic pattern is broad.** Any user agent containing `bot` is treated as a bot, which can catch an unusual browser or app whose name happens to contain those letters.
- **AI referrals are undercounted.** Many clicks from assistants, especially from mobile and desktop apps, arrive with no referrer and no `utm_source`. Treat the count as a floor.
- **Headless browsers that use a normal browser user agent are not detected.** That includes some AI agents that browse on a person's behalf.
- A crawler visit does not mean the page was used in a model or shown in an answer. It means the page was fetched.

## API

| Export | What it is |
|---|---|
| `classifyRequest({ userAgent, referrer, url, utmSource })` | The main entry point. All fields are optional. Returns a `Classification`. |
| `classifyBot(userAgent)` | Just the bot check. Returns `{ bot, vendor, purpose }` or `null`. |
| `classifyAiReferral(referrer, utmSource)` | Just the referral check. Returns the assistant's name or `null`. |
| `KNOWN_BOTS` | The named crawlers, in matching order. |
| `AI_PURPOSES` | The three purposes counted as AI. |
| `PURPOSE_LABEL` | A plain-words label for each purpose. |
| Types | `BotPurpose`, `BotMatch`, `RequestInfo`, `Classification` |

## Development

```bash
npm test          # vitest
npm run typecheck # tsc --noEmit
npm run build     # emits dist/
```

The library has no runtime dependencies.

## How this was built

Designed and directed by Justin Beegel, written with AI coding assistance, then reviewed and tested. It was extracted from a production system at NUDGE, where it feeds a private dashboard of crawler traffic and AI-referred visits, with all client data removed. This repository contains no traffic data.

## Work with me

I help businesses understand and improve how search engines and AI assistants see them: https://nudgemeforward.com

## License

MIT. Copyright (c) 2026 Justin Beegel.
