import type { ApiError, ApiErrorCode } from "@wmr/shared";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { HttpError } from "./http.ts";
import type { PdgaClient } from "./pdga.ts";
import { buildPlayerResponse } from "./player.ts";

const ERRORS: Record<ApiErrorCode, { status: ContentfulStatusCode; message: string }> =
  {
    invalid_pdga_no: { status: 400, message: "PDGA numbers are whole numbers." },
    not_found: { status: 404, message: "No PDGA player with that number." },
    rate_limited: {
      status: 503,
      message: "PDGA.com is rate limiting requests. Wait a minute and try again.",
    },
    upstream_error: {
      status: 502,
      message: "Couldn't load player data from PDGA.com.",
    },
  };

function errorCode(err: unknown): ApiErrorCode {
  if (err instanceof HttpError) {
    if (err.status === 404) return "not_found";
    if (err.status === 429) return "rate_limited";
  }
  return "upstream_error";
}

export function createApp(opts: {
  pdga: PdgaClient;
  logError?: (message: string, err: unknown) => void;
}) {
  const logError = opts.logError ?? (() => {});
  const app = new Hono();

  const fail = (code: ApiErrorCode) => {
    const { status, message } = ERRORS[code];
    return { body: { error: code, message } satisfies ApiError, status };
  };

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.get("/api/player/:pdgaNo", async (c) => {
    const raw = c.req.param("pdgaNo");
    if (!/^\d{1,8}$/.test(raw)) {
      const { body, status } = fail("invalid_pdga_no");
      return c.json(body, status);
    }
    const pdgaNo = Number(raw);
    try {
      const data = await opts.pdga.loadPlayer(pdgaNo);
      return c.json(buildPlayerResponse(data));
    } catch (err) {
      const code = errorCode(err);
      if (code !== "not_found") logError(`Failed to load player ${pdgaNo}`, err);
      const { body, status } = fail(code);
      return c.json(body, status);
    }
  });

  return app;
}
