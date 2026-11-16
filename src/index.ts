/**
 * Crawler and AI-referral classification from two request headers.
 *
 * Pure and dependency-free, so it can run on every request in a middleware
 * or an edge function: one pass over a short list of case-insensitive
 * tests, no network calls, no state.
 */

export type BotPurpose = "ai-training" | "ai-search" | "ai-assistant" | "search-engine" | "seo-tool" | "other";

export interface BotMatch {
  /** The crawler's name, for example "GPTBot". */
  bot: string;
  /** The company that runs it. */
  vendor: string;
  purpose: BotPurpose;
}

/** Order matters: the more specific agent names come before their families. */
const BOTS: { test: RegExp; bot: string; vendor: string; purpose: BotPurpose }[] = [
  { test: /GPTBot/i, bot: "GPTBot", vendor: "OpenAI", purpose: "ai-training" },
  { test: /OAI-SearchBot/i, bot: "OAI-SearchBot", vendor: "OpenAI", purpose: "ai-search" },
  { test: /ChatGPT-User/i, bot: "ChatGPT-User", vendor: "OpenAI", purpose: "ai-assistant" },
  { test: /Claude-SearchBot/i, bot: "Claude-SearchBot", vendor: "Anthropic", purpose: "ai-search" },
  { test: /Claude-User/i, bot: "Claude-User", vendor: "Anthropic", purpose: "ai-assistant" },
  { test: /ClaudeBot|anthropic-ai/i, bot: "ClaudeBot", vendor: "Anthropic", purpose: "ai-training" },
  { test: /Perplexity-User/i, bot: "Perplexity-User", vendor: "Perplexity", purpose: "ai-assistant" },
  { test: /PerplexityBot/i, bot: "PerplexityBot", vendor: "Perplexity", purpose: "ai-search" },
  { test: /Google-InspectionTool/i, bot: "Google-InspectionTool", vendor: "Google", purpose: "search-engine" },
  { test: /GoogleOther/i, bot: "GoogleOther", vendor: "Google", purpose: "ai-training" },
  { test: /Googlebot/i, bot: "Googlebot", vendor: "Google", purpose: "search-engine" },
  { test: /bingbot/i, bot: "Bingbot", vendor: "Microsoft", purpose: "search-engine" },
  { test: /Applebot/i, bot: "Applebot", vendor: "Apple", purpose: "search-engine" },
  { test: /meta-externalfetcher/i, bot: "Meta fetcher", vendor: "Meta", purpose: "ai-assistant" },
  { test: /meta-externalagent|FacebookBot/i, bot: "Meta AI crawler", vendor: "Meta", purpose: "ai-training" },
  { test: /CCBot/i, bot: "CCBot", vendor: "Common Crawl", purpose: "ai-training" },
  { test: /Bytespider/i, bot: "Bytespider", vendor: "ByteDance", purpose: "ai-training" },
  { test: /Amazonbot/i, bot: "Amazonbot", vendor: "Amazon", purpose: "ai-search" },
  { test: /DuckAssistBot/i, bot: "DuckAssistBot", vendor: "DuckDuckGo", purpose: "ai-assistant" },
  { test: /DuckDuckBot/i, bot: "DuckDuckBot", vendor: "DuckDuckGo", purpose: "search-engine" },
  { test: /MistralAI-User/i, bot: "MistralAI-User", vendor: "Mistral", purpose: "ai-assistant" },
  { test: /cohere-ai|cohere-training/i, bot: "Cohere", vendor: "Cohere", purpose: "ai-training" },
  { test: /YouBot/i, bot: "YouBot", vendor: "You.com", purpose: "ai-search" },
  { test: /YandexBot/i, bot: "YandexBot", vendor: "Yandex", purpose: "search-engine" },
  { test: /Baiduspider/i, bot: "Baiduspider", vendor: "Baidu", purpose: "search-engine" },
  { test: /AhrefsBot/i, bot: "AhrefsBot", vendor: "Ahrefs", purpose: "seo-tool" },
  { test: /SemrushBot/i, bot: "SemrushBot", vendor: "Semrush", purpose: "seo-tool" },
  { test: /MJ12bot/i, bot: "MJ12bot", vendor: "Majestic", purpose: "seo-tool" },
  { test: /DotBot/i, bot: "DotBot", vendor: "Moz", purpose: "seo-tool" },
];

const GENERIC_BOT = /bot|crawler|spider|crawl|slurp|fetcher|scraper|headless|python-requests|curl\/|wget/i;

/** The named crawlers this library knows, in matching order. */
export const KNOWN_BOTS: readonly BotMatch[] = BOTS.map(({ bot, vendor, purpose }) => ({ bot, vendor, purpose }));

/**
 * The crawler a user agent belongs to, or null for what looks like a
 * person's browser. A user agent that reads like automation but is not on
 * the list comes back as "Other bot".
 */
export function classifyBot(userAgent: string | null | undefined): BotMatch | null {
  if (!userAgent) return null;
  for (const b of BOTS) {
    if (b.test.test(userAgent)) return { bot: b.bot, vendor: b.vendor, purpose: b.purpose };
  }
  if (GENERIC_BOT.test(userAgent)) return { bot: "Other bot", vendor: "Other", purpose: "other" };
  return null;
}

export const AI_PURPOSES: readonly BotPurpose[] = ["ai-training", "ai-search", "ai-assistant"];

export const PURPOSE_LABEL: Record<BotPurpose, string> = {
  "ai-training": "AI model training",
  "ai-search": "AI search index",
  "ai-assistant": "Live AI answer",
  "search-engine": "Search engine",
  "seo-tool": "SEO tool",
  other: "Other bot",
};

/** Hostnames of AI assistants whose links send people to the site. */
const AI_REFERRERS: { test: RegExp; source: string }[] = [
  { test: /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/i, source: "ChatGPT" },
  { test: /(^|\.)perplexity\.ai$/i, source: "Perplexity" },
  { test: /(^|\.)claude\.ai$/i, source: "Claude" },
  { test: /(^|\.)gemini\.google\.com$|(^|\.)bard\.google\.com$/i, source: "Gemini" },
  { test: /(^|\.)copilot\.microsoft\.com$/i, source: "Copilot" },
  { test: /(^|\.)you\.com$/i, source: "You.com" },
  { test: /(^|\.)chat\.deepseek\.com$/i, source: "DeepSeek" },
  { test: /(^|\.)meta\.ai$/i, source: "Meta AI" },
];

/**
 * The AI assistant a human visit came from, by referrer host or by the
 * utm_source some assistants append (ChatGPT adds utm_source=chatgpt.com).
 */
export function classifyAiReferral(referrer: string | null | undefined, utmSource?: string | null): string | null {
  const hosts: string[] = [];
  if (utmSource) hosts.push(utmSource.trim().toLowerCase());
  if (referrer) {
    try {
      hosts.push(new URL(referrer).hostname.toLowerCase());
    } catch {
      // not a URL; ignore
    }
  }
  for (const host of hosts) {
    for (const r of AI_REFERRERS) if (r.test.test(host)) return r.source;
  }
  return null;
}

export interface RequestInfo {
  /** The User-Agent header. */
  userAgent?: string | null;
  /** The Referer header. */
  referrer?: string | null;
  /** The request URL. When given, its utm_source parameter is also checked. */
  url?: string | null;
  /** The utm_source value, if you have already parsed it. Wins over `url`. */
  utmSource?: string | null;
}

export type Classification =
  | {
      kind: "bot";
      bot: string;
      vendor: string;
      purpose: BotPurpose;
      /** The purpose in plain words, for a report. */
      label: string;
      /** True for the three AI purposes: training, search index, live answer. */
      isAi: boolean;
    }
  | {
      kind: "ai-referral";
      /** The assistant the visitor came from, for example "ChatGPT". */
      source: string;
    }
  | { kind: "none" };

function utmFrom(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url, "http://localhost").searchParams.get("utm_source");
  } catch {
    return null;
  }
}

/**
 * Classifies one request. The user agent is checked first: a crawler is a
 * crawler whatever its referrer says. Only when the user agent looks like a
 * person's browser is the referrer (and utm_source) checked for an AI
 * assistant.
 */
export function classifyRequest(request: RequestInfo): Classification {
  const bot = classifyBot(request.userAgent);
  if (bot) return { kind: "bot", ...bot, label: PURPOSE_LABEL[bot.purpose], isAi: AI_PURPOSES.includes(bot.purpose) };
  const source = classifyAiReferral(request.referrer, request.utmSource ?? utmFrom(request.url));
  if (source) return { kind: "ai-referral", source };
  return { kind: "none" };
}
