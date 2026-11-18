import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { MemoryCache } from "./cache.ts";
import { loadConfig } from "./config.ts";
import { createFetcher } from "./http.ts";
import { createPdgaClient } from "./pdga.ts";
import { createApp } from "./routes.ts";

const config = loadConfig();
const logError = (message: string, err: unknown) => console.error(message, err);

const pdga = createPdgaClient({
  urls: config.pdgaUrls,
  cache: new MemoryCache(),
  fetchJson: createFetcher({
    log: (message) => console.log(message),
    onRetry: (attempt, wait, label) =>
      console.warn(
        `pdga ${label} rate limited, retry ${attempt + 1} in ${wait / 1000}s`,
      ),
  }),
  logError,
});

const app = createApp({ pdga, logError });

// serve the built frontend, falling back to index.html for client-side routes
const webDist = fileURLToPath(new URL("../../web/dist", import.meta.url));
if (existsSync(webDist)) {
  app.use("/*", serveStatic({ root: webDist }));
  // page routes only: a missing asset or API path should 404, not get HTML
  app.get("*", async (c, next) => {
    const path = c.req.path;
    if (path.startsWith("/api/") || /\.[a-z0-9]+$/i.test(path)) return c.notFound();
    return serveStatic({ root: webDist, path: "index.html" })(c, next);
  });
}

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(`Listening on http://localhost:${port}`);
});
