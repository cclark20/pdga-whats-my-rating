import type { ApiError, PlayerResponse } from "@wmr/shared";

export class PlayerLoadError extends Error {
  readonly code: ApiError["error"] | "network";

  constructor(code: PlayerLoadError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export async function fetchPlayer(pdgaNo: string): Promise<PlayerResponse> {
  let res: Response;
  try {
    res = await fetch(`/api/player/${encodeURIComponent(pdgaNo)}`);
  } catch {
    throw new PlayerLoadError(
      "network",
      "Couldn't reach the server. Check your connection.",
    );
  }
  if (res.ok) return res.json();
  const body = (await res.json().catch(() => null)) as ApiError | null;
  throw new PlayerLoadError(
    body?.error ?? "upstream_error",
    body?.message ?? "Couldn't load player data.",
  );
}
