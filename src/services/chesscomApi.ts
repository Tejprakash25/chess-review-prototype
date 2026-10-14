
const API_BASE = "https://api.chess.com/pub";
const REQUEST_TIMEOUT_MS = 12_000;

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

async function fetchJson<T>(
  url: string,
  resourceName: string,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (response.status === 404) {
      throw new ChessComApiError(
        resourceName === "profile"
          ? "Player not found. Check the username and try again."
          : "The player was found, but their public game archives could not be found.",
        404,
      );
    }

    if (response.status === 410) {
      throw new ChessComApiError(
        "This Chess.com resource is no longer available.",
        410,
      );
    }

    if (response.status === 429) {
      throw new ChessComApiError(
        "Chess.com is temporarily limiting requests. Please wait before trying again.",
        429,
      );
    }

    if (!response.ok) {
      if (response.status >= 500) {
        throw new ChessComApiError(
          "Chess.com is temporarily unavailable. Please try again later.",
          response.status,
        );
      }

      throw new ChessComApiError(
        `The Chess.com request failed (HTTP ${response.status}).`,
        response.status,
      );
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new ChessComApiError(
        `Chess.com returned an invalid response for the ${resourceName}.`,
        response.status,
      );
    }
  } catch (error: unknown) {
    if (error instanceof ChessComApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new ChessComApiError(
        "The Chess.com request timed out. Please try again.",
      );
    }

    throw new ChessComApiError(
      "Could not connect to Chess.com. Check your internet connection and try again.",
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function isValidArchiveUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      url.hostname === "api.chess.com" &&
      /^\/pub\/player\/[^/]+\/games\/\d{4}\/(0[1-9]|1[0-2])\/?$/.test(
        url.pathname,
      )
    );
  } catch {
    return false;
  }
}

export async function getPlayerProfile(
  username: string,
): Promise<ChessComProfileResult> {
  const normalizedUsername = username.trim();

  if (!/^[a-zA-Z0-9_-]{3,25}$/.test(normalizedUsername)) {
    throw new ChessComApiError(
      "Enter a valid Chess.com username using 3–25 letters, numbers, underscores, or hyphens.",
    );
  }

  const encodedUsername = encodeURIComponent(normalizedUsername);

  // Keep requests sequential to reduce the risk of rate limiting.
  const player = await fetchJson<ChessComPlayer>(
    `${API_BASE}/player/${encodedUsername}`,
    "profile",
  );

  if (
    !player ||
    typeof player.username !== "string" ||
    player.username.trim().length === 0 ||
    typeof player.player_id !== "number" ||
    !Number.isFinite(player.player_id) ||
    typeof player.url !== "string"
  ) {
    throw new ChessComApiError(
      "Chess.com returned incomplete player information.",
    );
  }

  const archiveData = await fetchJson<{ archives: unknown }>(
    `${API_BASE}/player/${encodedUsername}/games/archives`,
    "archives",
  );

  if (
    !archiveData ||
    !Array.isArray(archiveData.archives) ||
    !archiveData.archives.every(isValidArchiveUrl)
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

export interface ChessComGamePlayer {
  username: string;
  rating?: number;
  result: string;
}

export interface ChessComGame {
  url: string;
  end_time: number;
  white: ChessComGamePlayer;
  black: ChessComGamePlayer;
  time_control?: string;
  time_class?: string;
  rules?: string;
  rated?: boolean;
  pgn?: string;
}

export async function getMonthlyGames(
  archiveUrl: string,
): Promise<ChessComGame[]> {
  if (!isValidArchiveUrl(archiveUrl)) {
    throw new ChessComApiError("Invalid monthly archive URL.");
  }

  const data = await fetchJson<{ games: unknown }>(
    archiveUrl,
    "monthly games",
  );

  if (
    !data ||
    !Array.isArray(data.games) ||
    !data.games.every((game: unknown) => {
      if (typeof game !== "object" || game === null) {
        return false;
      }

      const item = game as Record<string, unknown>;
      const validPlayer = (player: unknown): boolean => {
        if (typeof player !== "object" || player === null) {
          return false;
        }

        const value = player as Record<string, unknown>;

        return (
          typeof value.username === "string" &&
          typeof value.result === "string"
        );
      };

      return (
        typeof item.url === "string" &&
        typeof item.end_time === "number" &&
        Number.isFinite(item.end_time) &&
        validPlayer(item.white) &&
        validPlayer(item.black)
      );
    })
  ) {
    throw new ChessComApiError(
      "Chess.com returned an unexpected monthly game list.",
    );
  }

  return data.games as ChessComGame[];
}

