import { classifyRequest, type Classification } from "../src/index.js";

/**
 * A fetch-style middleware: it takes a standard Request and a handler that
 * returns a Response. This shape works as is in Cloudflare Workers, Deno,
 * Bun and Hono, and maps directly onto Next.js middleware.
 *
 * `record` is yours to write: a database insert, a log line, a queue. It is
 * not awaited, so a slow or failing write never delays or breaks the page.
 */
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
    // Browsers send Sec-Fetch-Dest: document on a page navigation.
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
