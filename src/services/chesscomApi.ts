const API_BASE = "https://api.chess.com/pub";

export interface ChessComPlayer {
  username: string;
  player_id: number;
  url: string;
  name?: string;
  avatar?: string;
  title?: string;
  status?: string;
}

export interface ChessComProfileResult {
  player: ChessComPlayer;
  archives: string[];
}

export class ChessComApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ChessComApiError";
  }
}


async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ChessComApiError(
        "Chess.com took too long to respond. Please try again.",
      );
    }

    throw new ChessComApiError(
      "Could not connect to Chess.com. Check your internet connection and try again.",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 404) {
    throw new ChessComApiError(
      "Chess.com could not find that player or their public data.",
      404,
    );
  }

  if (response.status === 429) {
    throw new ChessComApiError(
      "Chess.com is temporarily rate-limiting requests. Please wait before trying again.",
      429,
    );
  }

  if (!response.ok) {
    throw new ChessComApiError(
      `Chess.com returned an error (HTTP ${response.status}). Please try again later.`,
      response.status,
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ChessComApiError(
      "Chess.com returned an invalid response. Please try again.",
    );
  }
}


export async function getPlayerProfile(
  username: string,
): Promise<ChessComProfileResult> {
  const normalizedUsername = username.trim().toLowerCase();

  if (!/^[a-zA-Z0-9_-]{3,25}$/.test(normalizedUsername)) {
    throw new ChessComApiError(
      "Enter a username containing 3–25 letters, numbers, underscores, or hyphens.",
    );
  }

  const encodedUsername = encodeURIComponent(normalizedUsername);

  
  const player = await fetchJson<ChessComPlayer>(
    `${API_BASE}/player/${encodedUsername}`,
  );

  if (
    !player ||
    typeof player.username !== "string" ||
    player.username.trim().length === 0 ||
    typeof player.player_id !== "number" ||
    !Number.isFinite(player.player_id)
  ) {
    throw new ChessComApiError(
      "Chess.com returned incomplete player information.",
    );
  }

  const archiveData = await fetchJson<{ archives: unknown }>(
    `${API_BASE}/player/${encodedUsername}/games/archives`,
  );

  if (
    !archiveData ||
    !Array.isArray(archiveData.archives) ||
    !archiveData.archives.every(
      (archive: unknown) =>
        typeof archive === "string" &&
        /^https:\/\/api\.chess\.com\/pub\/player\/[^/]+\/games\/\d{4}\/\d{2}$/.test(
          archive,
        ),
    )
  ) {
    throw new ChessComApiError(
      "Chess.com returned an unexpected game archive list.",
    );
  }

  return {
    player,
    archives: archiveData.archives,
  };

}
