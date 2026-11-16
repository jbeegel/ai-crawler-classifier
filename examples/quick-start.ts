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
