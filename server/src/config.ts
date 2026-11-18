import type { PdgaUrls } from "./pdga.ts";

export interface Config {
  port: number;
  pdgaUrls: PdgaUrls;
}

const REQUIRED = {
  profile: "PDGA_PROFILE_URL",
  rounds: "PDGA_ROUNDS_URL",
  events: "PDGA_EVENTS_URL",
} as const;

/** Read config from the environment, failing fast with every missing variable. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const missing = Object.values(REQUIRED).filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  return {
    port: Number(env.PORT ?? 3000),
    pdgaUrls: {
      profile: env[REQUIRED.profile] ?? "",
      rounds: env[REQUIRED.rounds] ?? "",
      events: env[REQUIRED.events] ?? "",
    },
  };
}
