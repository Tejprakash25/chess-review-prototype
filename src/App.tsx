
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Chess } from "chess.js";
import LegalNotices from "./components/LegalNotices";
import GameReviewBoard from "./components/GameReviewBoard";
import {
  getPlayerProfile,
  getMonthlyGames,
  ChessComApiError,
  type ChessComProfileResult,
  type ChessComGame,
} from "./services/chesscomApi";
import {
  analyzeGamePositions,
  type MoveAnalysis,
} from "./services/stockfishAnalysis";

const features = [
  {
    number: "01",
    title: "Game analysis",
    description: "Understand the decisions behind your moves.",
  },
  {
    number: "02",
    title: "Key insights",
    description: "Discover important moments in completed games.",
  },
  {
    number: "03",
    title: "Critical positions",
    description: "Identify turning points that changed the game.",
  },
  {
    number: "04",
    title: "Improve your game",
    description: "Learn from mistakes and find stronger moves.",
  },
];

const DRAW_RESULTS = new Set([
  "agreed",
  "repetition",
  "stalemate",
  "insufficient",
  "50move",
  "timevsinsufficient",
]);

interface ParsedGame {
  headers: Record<string, string>;
  moves: string[];
  initialFen: string;
  finalFen: string;
}

function parseGamePgn(pgn: string): ParsedGame {
  const chess = new Chess();
  chess.loadPgn(pgn);

  const headers = chess.getHeaders();
  const initialFen =
    headers.SetUp === "1" && headers.FEN
      ? headers.FEN
      : new Chess().fen();

  return {
    headers,
    moves: chess.history(),
    initialFen,
    finalFen: chess.fen(),
  };
}

function getGameResult(game: ChessComGame, username: string): string {
  const normalizedUsername = username.toLowerCase();

  const player =
    game.white.username.toLowerCase() === normalizedUsername
      ? game.white
      : game.black.username.toLowerCase() === normalizedUsername
        ? game.black
        : null;

  if (!player) return "Unknown";
  if (player.result === "win") return "Win";
  if (DRAW_RESULTS.has(player.result)) return "Draw";

  return "Loss";
}

function getOpponent(game: ChessComGame, username: string): string {
  return game.white.username.toLowerCase() === username.toLowerCase()
    ? game.black.username
    : game.white.username;
}

function formatGameDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTimeControl(timeControl?: string): string {
  if (!timeControl) return "Not available";

  const match = timeControl.match(/^(\d+)(?:\+(\d+))?$/);

  if (!match) {
    if (/^\d+\/\d+$/.test(timeControl)) return "Daily";
    return timeControl;
  }

  const seconds = Number(match[1]);
  const increment = Number(match[2] ?? 0);

  if (seconds >= 60 && seconds % 60 === 0) {
    const minutes = seconds / 60;
    return increment > 0
      ? `${minutes} min + ${increment} sec`
      : `${minutes} min`;
  }

  return increment > 0
    ? `${seconds} sec + ${increment} sec`
    : `${seconds} sec`;
}

function formatEvaluation(result: MoveAnalysis): string {
  if (result.mateInWhite !== null) {
    const mate = result.mateInWhite;

    if (mate === 0) return "Forced mate";
    return mate > 0 ? `White mates in ${mate}` : `Black mates in ${Math.abs(mate)}`;
  }

  if (result.evaluationCpWhite === null) return "Evaluation unavailable";

  const score = result.evaluationCpWhite;
  const sign = score > 0 ? "+" : "";

  return `${sign}${score.toFixed(2)}`;
}

type ReviewSummary = {
  totalMoves: number;
  ratedMoves: number;
  good: number;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
  unrated: number;
  averageLoss: number | null;
  accuracy: number | null;
  biggestLoss: MoveAnalysis | null;
  findings: MoveAnalysis[];
};

function buildReviewSummary(
  results: MoveAnalysis[],
): ReviewSummary {
  const summary: ReviewSummary = {
    totalMoves: results.length,
    ratedMoves: 0,
    good: 0,
    inaccuracies: 0,
    mistakes: 0,
    blunders: 0,
    unrated: 0,
    averageLoss: null,
    accuracy: null,
    biggestLoss: null,
    findings: [],
  };

  const ratedResults: MoveAnalysis[] = [];

  for (const result of results) {
    switch (result.classification) {
      case "good":
        summary.good += 1;
        break;
      case "inaccuracy":
        summary.inaccuracies += 1;
        break;
      case "mistake":
        summary.mistakes += 1;
        break;
      case "blunder":
        summary.blunders += 1;
        break;
      case "unrated":
        summary.unrated += 1;
        break;
    }

    if (
      result.evaluationLossPawns !== null &&
      Number.isFinite(result.evaluationLossPawns) &&
      result.evaluationLossPawns >= 0
    ) {
      ratedResults.push(result);
    }
  }

  summary.ratedMoves = ratedResults.length;

  if (ratedResults.length > 0) {
    const totalLoss = ratedResults.reduce(
      (sum, result) => sum + result.evaluationLossPawns!,
      0,
    );

    const averageLoss = totalLoss / ratedResults.length;

    summary.averageLoss = averageLoss;

    // Prototype heuristic, not an official Chess.com accuracy formula.
    // An average loss of 0 pawns maps to 100%.
    // An average loss of 2 pawns or more maps to 0%.
    summary.accuracy = Math.max(
      0,
      Math.min(100, 100 * (1 - averageLoss / 2)),
    );

    summary.biggestLoss = ratedResults.reduce((largest, result) =>
      result.evaluationLossPawns! > largest.evaluationLossPawns!
        ? result
        : largest,
    );
  }

  summary.findings = results
    .filter(
      (result) =>
        result.classification === "inaccuracy" ||
        result.classification === "mistake" ||
        result.classification === "blunder",
    )
    .sort(
      (a, b) =>
        (b.evaluationLossPawns ?? 0) -
        (a.evaluationLossPawns ?? 0),
    );

  return summary;
}

function formatWhiteEvaluation(
  evaluationCpWhite: number | null,
  mateInWhite: number | null,
): string {
  if (mateInWhite !== null) {
    if (mateInWhite === 0) return "Forced mate";

    return mateInWhite > 0
      ? `White mates in ${mateInWhite}`
      : `Black mates in ${Math.abs(mateInWhite)}`;
  }

  if (evaluationCpWhite === null) {
    return "Evaluation unavailable";
  }

  const sign = evaluationCpWhite > 0 ? "+" : "";

  return `${sign}${evaluationCpWhite.toFixed(2)}`;
}


function App() {
  const [username, setUsername] = useState("");
  const [isCheckingPlayer, setIsCheckingPlayer] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [playerResult, setPlayerResult] =
    useState<ChessComProfileResult | null>(null);

  const [selectedArchive, setSelectedArchive] = useState("");
  const [games, setGames] = useState<ChessComGame[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [gamesError, setGamesError] = useState("");
  const [gamesEmpty, setGamesEmpty] = useState(false);

  const [selectedGameUrl, setSelectedGameUrl] = useState("");
  const [parsedGame, setParsedGame] = useState<ParsedGame | null>(null);
  const [pgnError, setPgnError] = useState("");
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);

  const [analysisResults, setAnalysisResults] = useState<MoveAnalysis[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({
    completed: 0,
    total: 0,
  });
  const [analysisError, setAnalysisError] = useState("");

  const selectedGame =
    games.find((game) => game.url === selectedGameUrl) ?? null;

  const currentFen = useMemo(() => {
    if (!parsedGame) return new Chess().fen();

    const replay = new Chess(parsedGame.initialFen);

    for (const san of parsedGame.moves.slice(0, currentMoveIndex)) {
      replay.move(san);
    }

    return replay.fen();
  }, [parsedGame, currentMoveIndex]);

  const currentAnalysis =
    analysisResults.find((item) => item.ply === currentMoveIndex) ?? null;
  
  const reviewSummary = useMemo(
  () => buildReviewSummary(analysisResults),
  [analysisResults],
);

  useEffect(() => {
    if (!parsedGame) {
      setAnalysisResults([]);
      setIsAnalyzing(false);
      setAnalysisProgress({ completed: 0, total: 0 });
      setAnalysisError("");
      return;
    }

    const controller = new AbortController();

    setAnalysisResults([]);
    setAnalysisError("");
    setIsAnalyzing(true);
    setAnalysisProgress({
      completed: 0,
      total: parsedGame.moves.length,
    });

    analyzeGamePositions(
      parsedGame.initialFen,
      parsedGame.moves,
      (completed, total) => {
        setAnalysisProgress({ completed, total });
      },
      controller.signal,
    )
      .then((results) => {
        setAnalysisResults(results);
      })
      .catch((error: unknown) => {
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          return;
        }

        setAnalysisError(
          error instanceof Error
            ? error.message
            : "Stockfish analysis failed. Check the engine files and try again.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsAnalyzing(false);
        }
      });

    return () => controller.abort();
  }, [parsedGame]);

  const resetGameSelection = () => {
    setSelectedGameUrl("");
    setParsedGame(null);
    setPgnError("");
    setCurrentMoveIndex(0);
    setAnalysisResults([]);
    setAnalysisProgress({ completed: 0, total: 0 });
    setAnalysisError("");
    setIsAnalyzing(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedUsername = username.trim();

    setErrorMessage("");
    setStatusMessage("");
    setPlayerResult(null);
    setSelectedArchive("");
    setGames([]);
    setGamesError("");
    setGamesEmpty(false);
    resetGameSelection();

    if (!/^[a-zA-Z0-9_-]{3,25}$/.test(normalizedUsername)) {
      setErrorMessage(
        "Enter a valid Chess.com username using 3–25 letters, numbers, underscores, or hyphens.",
      );
      return;
    }

    setIsCheckingPlayer(true);

    try {
      const result = await getPlayerProfile(normalizedUsername);
      setPlayerResult(result);

      setStatusMessage(
        result.archives.length === 0
          ? `Player @${result.player.username} was found, but no public game archives are available.`
          : `Player verified. Found ${result.archives.length} monthly game archive(s).`,
      );
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof ChessComApiError
          ? error.message
          : "Something went wrong while checking this player. Please try again.",
      );
    } finally {
      setIsCheckingPlayer(false);
    }
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    setErrorMessage("");
    setStatusMessage("");
    setPlayerResult(null);
    setSelectedArchive("");
    setGames([]);
    setGamesError("");
    setGamesEmpty(false);
    resetGameSelection();
  };

  const handleArchiveSelect = async (archiveUrl: string) => {
    setSelectedArchive(archiveUrl);
    setGames([]);
    setGamesError("");
    setGamesEmpty(false);
    resetGameSelection();
    setIsLoadingGames(true);

    try {
      const archiveGames = await getMonthlyGames(archiveUrl);
      const sortedGames = [...archiveGames].sort(
        (a, b) => b.end_time - a.end_time,
      );

      setGames(sortedGames);
      setGamesEmpty(sortedGames.length === 0);
    } catch (error: unknown) {
      setGamesError(
        error instanceof ChessComApiError
          ? error.message
          : "Could not load games for this month. Check your connection and try again.",
      );
    } finally {
      setIsLoadingGames(false);
    }
  };

  const handleGameSelect = (game: ChessComGame) => {
    setSelectedGameUrl(game.url);
    setParsedGame(null);
    setPgnError("");
    setCurrentMoveIndex(0);
    setAnalysisResults([]);
    setAnalysisError("");

    if (typeof game.pgn !== "string" || !game.pgn.trim()) {
      setPgnError(
        "This game does not contain PGN notation in the loaded archive. Select another game with available PGN data.",
      );
      return;
    }

    try {
      const parsed = parseGamePgn(game.pgn);

      if (parsed.moves.length === 0) {
        setPgnError(
          "The PGN was loaded, but no moves were found in this game.",
        );
        return;
      }

      setParsedGame(parsed);
    } catch {
      setPgnError(
        "The PGN could not be parsed. The notation may be incomplete or invalid.",
      );
    }
  };

  const goToMove = (index: number) => {
    if (!parsedGame) return;

    setCurrentMoveIndex(
      Math.max(0, Math.min(index, parsedGame.moves.length)),
    );
  };

  const handleReplayKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.target !== event.currentTarget || !parsedGame) return;

    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        goToMove(currentMoveIndex - 1);
        break;
      case "ArrowRight":
        event.preventDefault();
        goToMove(currentMoveIndex + 1);
        break;
      case "Home":
        event.preventDefault();
        goToMove(0);
        break;
      case "End":
        event.preventDefault();
        goToMove(parsedGame.moves.length);
        break;
    }
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Chess Review home">
          <span className="brand-mark" aria-hidden="true">
            ♞
          </span>
          <span>
            CHESS <strong>REVIEW</strong>
          </span>
        </a>
        <span className="topbar-note">Understand every move</span>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <p className="eyebrow">YOUR GAME. YOUR NEXT LEVEL.</p>
          <h1 id="hero-title">
            Every move has
            <br />
            <span>something to teach.</span>
          </h1>
          <p className="hero-description">
            Review your completed Chess.com games, explore critical
            positions, and understand your decisions. Turn every game into
            an opportunity to improve.
          </p>
          <div className="hero-actions">
            <a
              className="primary-cta"
              href="#username-form"
              aria-label="Find games using your Chess.com username"
            >
              Review a game <span aria-hidden="true">↗</span>
            </a>
            <p className="cta-note">
              Completed games only · Prototype in development
            </p>
          </div>
        </section>

        <section
          className="username-panel glass-panel"
          aria-labelledby="username-title"
        >
          <div className="section-heading">
            <p className="eyebrow">GET STARTED</p>
            <h2 id="username-title">Find your Chess.com profile</h2>
            <p>
              Enter your public Chess.com username to find your available
              games.
            </p>
          </div>

          <form
            id="username-form"
            className="username-form"
            onSubmit={handleSubmit}
            noValidate
          >
            <label htmlFor="chess-username">Chess.com username</label>
            <div className="username-input-row">
              <input
                id="chess-username"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Enter your username"
                value={username}
                onChange={(event) =>
                  handleUsernameChange(event.target.value)
                }
                aria-invalid={Boolean(errorMessage)}
                aria-describedby={
                  errorMessage ? "username-error" : "username-hint"
                }
                disabled={isCheckingPlayer || isLoadingGames}
                required
                minLength={3}
                maxLength={25}
              />
              <button
                className="primary-cta"
                type="submit"
                disabled={isCheckingPlayer || isLoadingGames}
              >
                {isCheckingPlayer ? "Checking..." : "Find my games"}
              </button>
            </div>

            <p id="username-hint" className="form-hint">
              Use your Chess.com username, not your email address.
            </p>

            {errorMessage && (
              <p
                id="username-error"
                className="form-message error-message"
                role="alert"
              >
                {errorMessage}
              </p>
            )}

            {statusMessage && (
              <p className="form-message" role="status">
                {statusMessage}
              </p>
            )}
          </form>

          {playerResult && (
            <section
              className="player-result glass-panel"
              aria-labelledby="player-result-title"
            >
              <div className="player-result-header">
                {playerResult.player.avatar && (
                  <img
                    src={playerResult.player.avatar}
                    alt=""
                    className="player-avatar"
                    width={52}
                    height={52}
                    loading="lazy"
                  />
                )}
                <div>
                  <h3 id="player-result-title">
                    {playerResult.player.name ||
                      playerResult.player.username}
                  </h3>
                  <p>@{playerResult.player.username}</p>
                </div>
              </div>

              <p>
                <strong>{playerResult.archives.length}</strong>{" "}
                monthly archive(s) available
              </p>

              {playerResult.archives.length > 0 && (
                <section
                  className="monthly-archives"
                  aria-labelledby="archives-title"
                >
                  <h3 id="archives-title">Available game months</h3>
                  <ul className="archive-list">
                    {[...playerResult.archives].reverse().map((archiveUrl) => {
                      const match = archiveUrl.match(
                        /\/games\/(\d{4})\/(\d{2})\/?$/,
                      );
                      if (!match) return null;

                      const year = Number(match[1]);
                      const month = Number(match[2]);
                      const monthLabel = new Date(
                        Date.UTC(year, month - 1, 1),
                      ).toLocaleDateString(undefined, {
                        month: "long",
                        year: "numeric",
                        timeZone: "UTC",
                      });
                      const isSelected = selectedArchive === archiveUrl;

                      return (
                        <li
                          key={archiveUrl}
                          className="archive-item"
                        >
                          <span>{monthLabel}</span>
                          <button
                            type="button"
                            className="archive-select-button"
                            onClick={() => handleArchiveSelect(archiveUrl)}
                            disabled={isLoadingGames}
                            aria-pressed={isSelected}
                          >
                            {isSelected && isLoadingGames
                              ? "Loading..."
                              : isSelected
                                ? "Selected"
                                : "View games"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {playerResult.player.url && (
                <p>
                  <a
                    href={playerResult.player.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View Chess.com profile ↗
                  </a>
                </p>
              )}

              <section
                className="completed-games"
                aria-labelledby="games-title"
                aria-busy={isLoadingGames}
              >
                <h3 id="games-title">Completed games</h3>

                {isLoadingGames && (
                  <div
                    className="games-state"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="loading-indicator" aria-hidden="true" />
                    <p>Loading completed games...</p>
                    <p className="form-hint">
                      Fetching the selected month's public game archive.
                    </p>
                  </div>
                )}

                {!isLoadingGames && gamesError && (
                  <div className="games-state" role="alert">
                    <p className="games-state-title">
                      Couldn't load these games
                    </p>
                    <p>{gamesError}</p>
                    {selectedArchive && (
                      <button
                        type="button"
                        className="archive-select-button"
                        onClick={() => handleArchiveSelect(selectedArchive)}
                      >
                        Try again
                      </button>
                    )}
                  </div>
                )}

                {!isLoadingGames &&
                  !gamesError &&
                  gamesEmpty &&
                  selectedArchive && (
                    <div className="games-state" role="status">
                      <p className="games-state-title">
                        No games in this month
                      </p>
                      <p>
                        Chess.com returned an empty archive for this month.
                        Choose another month to view available games.
                      </p>
                    </div>
                  )}

                {!isLoadingGames &&
                  !gamesError &&
                  !gamesEmpty &&
                  !selectedArchive && (
                    <p className="form-hint">
                      Select a month above to load its completed games.
                    </p>
                  )}

                {!isLoadingGames && !gamesError && games.length > 0 && (
                  <p className="form-hint" role="status">
                    Showing {games.length} completed game(s), newest first.
                  </p>
                )}

                {!isLoadingGames && games.length > 0 && (
                  <>
                    {selectedGame && (
                      <div
                        className="selected-game-panel"
                        aria-labelledby="selected-game-title"
                      >
                        <p
                          id="selected-game-title"
                          className="selected-game-title"
                        >
                          Game selected for review
                        </p>
                        <p>
                          {selectedGame.white.username} vs.{" "}
                          {selectedGame.black.username}
                        </p>
                        <p className="form-hint">
                          {formatGameDate(selectedGame.end_time)}
                          {selectedGame.time_class
                            ? ` · ${selectedGame.time_class.toUpperCase()}`
                            : ""}
                        </p>

                        {pgnError && (
                          <div className="games-state" role="alert">
                            <p className="games-state-title">
                              PGN unavailable
                            </p>
                            <p>{pgnError}</p>
                          </div>
                        )}

                        {parsedGame && (
                          <div className="pgn-review">
                            <p className="selected-game-title">
                              Stockfish game analysis
                            </p>

                            <div className="pgn-summary">
                              <span>
                                White:{" "}
                                {parsedGame.headers.White ||
                                  selectedGame.white.username}
                              </span>
                              <span>
                                Black:{" "}
                                {parsedGame.headers.Black ||
                                  selectedGame.black.username}
                              </span>
                              <span>
                                Result: {parsedGame.headers.Result || "*"}
                              </span>
                              <span>
                                Date: {formatGameDate(selectedGame.end_time)}
                              </span>
                              <span>
                                Time control:{" "}
                                {formatTimeControl(selectedGame.time_control)}
                              </span>
                              <span>
                                Game type:{" "}
                                {selectedGame.time_class?.toUpperCase() ||
                                  "Not available"}
                              </span>
                              <span>Plies: {parsedGame.moves.length}</span>
                              <span>
                                Current ply: {currentMoveIndex} /{" "}
                                {parsedGame.moves.length}
                              </span>
                            </div>

                            {isAnalyzing && (
                              <div
                                className="analysis-progress"
                                role="status"
                                aria-live="polite"
                              >
                                <p>
                                  Analysing positions with Stockfish:{" "}
                                  {analysisProgress.completed} /{" "}
                                  {analysisProgress.total}
                                </p>
                                <progress
                                  value={analysisProgress.completed}
                                  max={Math.max(analysisProgress.total, 1)}
                                />
                                <p className="form-hint">
                                  Analysis runs locally in your browser. Long
                                  games may take some time.
                                </p>
                              </div>
                            )}

                            {analysisError && (
                              <div className="games-state" role="alert">
                                <p className="games-state-title">
                                  Engine analysis failed
                                </p>
                                <p>{analysisError}</p>
                                <p className="form-hint">
                                  Check that both Stockfish files exist in
                                  public/stockfish and are served successfully.
                                </p>
                              </div>
                            )}


{!isAnalyzing &&
  !analysisError &&
  analysisResults.length > 0 && (
    <section
      className="review-report"
      aria-labelledby="review-report-title"
    >
      <h4 id="review-report-title">Game review report</h4>

      <div className="review-report-stats">
        <div className="review-stat">
          <span>Moves analysed</span>
          <strong>{reviewSummary.totalMoves}</strong>
        </div>

        <div className="review-stat">
          <span>Good moves</span>
          <strong>{reviewSummary.good}</strong>
        </div>

        <div className="review-stat">
          <span>Inaccuracies</span>
          <strong>{reviewSummary.inaccuracies}</strong>
        </div>

        <div className="review-stat">
          <span>Mistakes</span>
          <strong>{reviewSummary.mistakes}</strong>
        </div>

        <div className="review-stat">
          <span>Blunders</span>
          <strong>{reviewSummary.blunders}</strong>
        </div>

        <div className="review-stat">
          <span>Unrated</span>
          <strong>{reviewSummary.unrated}</strong>
        </div>
      </div>

      <div className="review-accuracy">
        <p className="eyebrow">ESTIMATED ACCURACY</p>

        <strong className="review-accuracy-value">
          {reviewSummary.accuracy === null
            ? "Unavailable"
            : `${reviewSummary.accuracy.toFixed(1)}%`}
        </strong>

        <p>
          {reviewSummary.averageLoss === null
            ? "There are not enough rated moves to calculate this estimate."
            : `Average evaluation loss: ${reviewSummary.averageLoss.toFixed(2)} pawns across ${reviewSummary.ratedMoves} rated moves.`}
        </p>

        <p className="form-hint">
          This is a prototype estimate, not an official Chess.com
          accuracy score. It is calculated as:
          {" "}max(0, min(100, 100 × (1 − average evaluation loss ÷ 2))).
          An average loss of 0 pawns gives 100%; 2 pawns or more
          gives 0%. Unrated moves are excluded.
        </p>
      </div>

      {reviewSummary.biggestLoss && (
        <div className="review-biggest-loss">
          <strong>Largest evaluation loss</strong>
          <p>
            {reviewSummary.biggestLoss.color === "w"
              ? "White"
              : "Black"}{" "}
            played {reviewSummary.biggestLoss.playedSan} on move{" "}
            {reviewSummary.biggestLoss.moveNumber}, losing{" "}
            {reviewSummary.biggestLoss.evaluationLossPawns!.toFixed(2)}{" "}
            pawns by this engine-based estimate.
          </p>

          <button
            type="button"
            className="archive-select-button"
            onClick={() =>
              goToMove(reviewSummary.biggestLoss!.ply)
            }
          >
            Review this move
          </button>
        </div>
      )}

      <div className="review-findings">
        <h5>Critical findings</h5>

        {reviewSummary.findings.length === 0 ? (
          <p>
            No inaccuracies, mistakes, or blunders were identified
            by the current classification thresholds.
          </p>
        ) : (
          <ol className="review-finding-list">
            {reviewSummary.findings.map((finding) => (
              <li
                key={finding.ply}
                className="review-finding"
              >
                <div>
                  <span
                    className={`move-classification move-classification-${finding.classification}`}
                  >
                    {finding.classification}
                  </span>

                  <p>
                    Move {finding.moveNumber}
                    {finding.color === "w" ? "." : "..."}{" "}
                    {finding.color === "w" ? "White" : "Black"}{" "}
                    played <strong>{finding.playedSan}</strong>.
                  </p>

                  <p className="form-hint">
                    Evaluation before:{" "}
                    {formatEvaluation(finding)}.
                    {" "}Evaluation after:{" "}
                    {formatWhiteEvaluation(
                      finding.evaluationAfterCpWhite,
                      finding.mateAfterInWhite,
                    )}
                    .
                  </p>

                  <p className="form-hint">
                    Estimated evaluation loss:{" "}
                    {finding.evaluationLossPawns === null
                      ? "Unavailable"
                      : `${finding.evaluationLossPawns.toFixed(2)} pawns`}
                    .
                  </p>
                </div>

                <button
                  type="button"
                  className="archive-select-button"
                  onClick={() => goToMove(finding.ply)}
                  aria-label={`Review move ${finding.moveNumber}, ${finding.playedSan}`}
                >
                  Review move
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )}


                            {currentAnalysis && (
                              <section
                                className="engine-evaluation"
                                aria-labelledby="engine-evaluation-title"
                              >
                                <h4 id="engine-evaluation-title">
                                  Position evaluation
                                </h4>
                                <div className="pgn-summary">
                                  <span>
                                    Evaluation:{" "}
                                    <strong>
                                      {formatEvaluation(currentAnalysis)}
                                    </strong>
                                  </span>
                                  <span>
                                    Engine depth: {currentAnalysis.depth}
                                  </span>
                                  <span>
                                    Played move:{" "}
                                    {currentAnalysis.playedSan}
                                  </span>
                                  <span>
                                    Suggested move:{" "}
                                    <strong>
                                      {currentAnalysis.bestMoveSan}
                                    </strong>
                                  </span>
                                </div>
                                <p>
  <strong>Move quality:</strong>{" "}
  <span
    className={`move-classification move-classification-${currentAnalysis.classification}`}
  >
    {currentAnalysis.classification === "unrated"
      ? "Not rated"
      : currentAnalysis.classification.charAt(0).toUpperCase() +
        currentAnalysis.classification.slice(1)}
  </span>
</p>

{currentAnalysis.evaluationLossPawns !== null && (
  <p>
    <strong>Evaluation lost:</strong>{" "}
    {currentAnalysis.evaluationLossPawns.toFixed(2)} pawns
  </p>
)}
                                <p className="form-hint">
                                  Evaluation is from White's perspective.
                                  The suggested move is Stockfish's best move
                                  for the position before the displayed played
                                  move.
                                </p>
                              </section>
                            )}

                            <h4>Board replay</h4>
                            <div
                              className="review-board-keyboard"
                              tabIndex={0}
                              role="group"
                              aria-label="Chessboard replay. Use left and right arrow keys to navigate moves, Home for the start, and End for the final position."
                              onKeyDown={handleReplayKeyDown}
                            >
                              <GameReviewBoard positionFen={currentFen} />
                              <p className="form-hint">
                                Keyboard: ← previous · → next · Home start ·
                                End finish
                              </p>
                            </div>

                            <div
                              className="replay-controls"
                              role="group"
                              aria-label="Game replay controls"
                            >
                              <button
                                type="button"
                                onClick={() => goToMove(0)}
                                disabled={currentMoveIndex === 0}
                                aria-label="Go to starting position"
                              >
                                First
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  goToMove(currentMoveIndex - 1)
                                }
                                disabled={currentMoveIndex === 0}
                                aria-label="Previous move"
                              >
                                ← Previous
                              </button>
                              <span
                                className="replay-position"
                                aria-live="polite"
                                aria-atomic="true"
                              >
                                {currentMoveIndex === 0
                                  ? "Starting position"
                                  : `After ply ${currentMoveIndex}`}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  goToMove(currentMoveIndex + 1)
                                }
                                disabled={
                                  currentMoveIndex >= parsedGame.moves.length
                                }
                                aria-label="Next move"
                              >
                                Next →
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  goToMove(parsedGame.moves.length)
                                }
                                disabled={
                                  currentMoveIndex >= parsedGame.moves.length
                                }
                                aria-label="Go to final position"
                              >
                                Last
                              </button>
                            </div>

                            <label
                              className="move-slider-label"
                              htmlFor="move-slider"
                            >
                              Move position
                            </label>
                            <input
                              id="move-slider"
                              className="move-slider"
                              type="range"
                              min={0}
                              max={parsedGame.moves.length}
                              value={currentMoveIndex}
                              onChange={(event) =>
                                goToMove(Number(event.target.value))
                              }
                              aria-valuetext={
                                currentMoveIndex === 0
                                  ? "Starting position"
                                  : `Ply ${currentMoveIndex} of ${parsedGame.moves.length}`
                              }
                            />

                            <h4>Move history</h4>
                            <ol className="pgn-move-list">
                              {parsedGame.moves.map((move, index) => {
                                const result = analysisResults[index];
                                const isCurrent =
                                  currentMoveIndex === index + 1;

                                return (
                                  <li
                                    key={`${index}-${move}`}
                                    className={
                                      isCurrent ? "pgn-move-current" : ""
                                    }
                                  >
                                    <button
                                      type="button"
                                      onClick={() => goToMove(index + 1)}
                                      aria-current={
                                        isCurrent ? "step" : undefined
                                      }
                                      aria-label={`Go to ply ${index + 1}, ${move}`}
                                    >
                                      <span className="move-number">
                                        {Math.floor(index / 2) + 1}
                                        {index % 2 === 0 ? "." : "..."}
                                      </span>{" "}
                                      {move}
                                    </button>
                                    {result && (
                                      <span className="move-evaluation">
                                        {formatEvaluation(result)}
                                      </span>
                                    )}
                                  </li>
                                );
                              })}
                            </ol>

                            <details className="pgn-details">
                              <summary>PGN headers and final FEN</summary>
                              <dl className="pgn-header-list">
                                {Object.entries(parsedGame.headers).map(
                                  ([key, value]) => (
                                    <div key={key}>
                                      <dt>{key}</dt>
                                      <dd>{value}</dd>
                                    </div>
                                  ),
                                )}
                              </dl>
                              <code>{parsedGame.finalFen}</code>
                            </details>
                          </div>
                        )}
                      </div>
                    )}

                    <ul className="completed-game-list">
                      {games.map((game) => {
                        const result = getGameResult(
                          game,
                          playerResult.player.username,
                        );
                        const isGameSelected = selectedGameUrl === game.url;

                        return (
                          <li
                            key={game.url}
                            className={`completed-game${
                              isGameSelected
                                ? " completed-game-selected"
                                : ""
                            }`}
                          >
                            <div className="completed-game-main">
                              <div>
                                <p className="game-opponent">
                                  vs. {getOpponent(game, username)}
                                </p>
                                <p className="form-hint">
                                  {formatGameDate(game.end_time)}
                                </p>
                              </div>
                              <span
                                className={`game-result game-result-${result.toLowerCase()}`}
                              >
                                {result}
                              </span>
                            </div>

                            <div className="game-metadata">
                              <span>
                                {game.time_class?.toUpperCase() || "Game"}
                              </span>
                              <span>
                                {formatTimeControl(game.time_control)}
                              </span>
                              {typeof game.rated === "boolean" && (
                                <span>
                                  {game.rated ? "Rated" : "Unrated"}
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              className="select-game-button"
                              onClick={() => handleGameSelect(game)}
                              aria-pressed={isGameSelected}
                            >
                              {isGameSelected
                                ? "Selected for review"
                                : "Select for review"}
                            </button>

                            <a
                              href={game.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View game on Chess.com ↗
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </section>
            </section>
          )}
        </section>

        <section className="workflow" aria-labelledby="workflow-title">
          <div className="section-heading">
            <p className="eyebrow">THE PROCESS</p>
            <h2 id="workflow-title">From moves to meaningful insights</h2>
          </div>

          <div className="feature-list">
            {features.map((feature) => (
              <article
                className="feature-item glass-panel"
                key={feature.number}
              >
                <span className="feature-number">{feature.number}</span>
                <div className="feature-copy">
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </div>
                <span className="feature-arrow" aria-hidden="true">
                  ↗
                </span>
              </article>
            ))}
          </div>
        </section>

        <LegalNotices />
      </main>

      <footer className="footer">
        <p>Chess Review · Built to help you understand your game.</p>
        <p>Independent prototype, not affiliated with Chess.com.</p>
      </footer>
    </div>
  );
}

export default App;
