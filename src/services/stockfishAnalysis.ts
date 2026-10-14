
import { Chess } from "chess.js";

export type MoveClassification =
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "unrated";

export interface MoveAnalysis {
  ply: number;
  moveNumber: number;
  color: "w" | "b";
  playedSan: string;
  playedMoveUci: string;
  fen: string;
  bestMoveUci: string;
  bestMoveSan: string;

  // Existing field retained for compatibility.
  // The numeric value is measured in pawns, not raw centipawns.
  evaluationCpWhite: number | null;
  mateInWhite: number | null;

  // Evaluation of the position after the played move.
  evaluationAfterCpWhite: number | null;
  mateAfterInWhite: number | null;

  // Positive means the player who moved lost evaluation.
  evaluationLossPawns: number | null;
  classification: MoveClassification;

  depth: number;
}

interface EngineScore {
  type: "cp" | "mate";
  value: number;
  depth: number;
}

interface PositionRecord {
  fen: string;
  sideToMove: "w" | "b";
  ply?: number;
  moveNumber?: number;
  color?: "w" | "b";
  playedSan?: string;
  playedMoveUci?: string;
}

interface PositionResult {
  bestMoveUci: string;
  evaluationCpWhite: number | null;
  mateInWhite: number | null;
  depth: number;
}

type ProgressCallback = (completed: number, total: number) => void;

const ENGINE_PATH = "/stockfish/stockfish-19-lite-single.js";
const ENGINE_TIMEOUT_MS = 60_000;
const ENGINE_START_TIMEOUT_MS = 30_000;

// Longer games use a shallower search to reduce total analysis time.
const STANDARD_SEARCH_DEPTH = 10;
const MEDIUM_GAME_SEARCH_DEPTH = 9;
const LONG_GAME_SEARCH_DEPTH = 8;
const MEDIUM_GAME_PLIES = 60;
const LONG_GAME_PLIES = 100;

// Prototype thresholds. These are not official Chess.com thresholds.
const INACCURACY_THRESHOLD = 0.5;
const MISTAKE_THRESHOLD = 1.0;
const BLUNDER_THRESHOLD = 2.0;

function abortError(): Error {
  return new DOMException("Analysis cancelled.", "AbortError");
}

function checkAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw abortError();
  }
}

function waitForLine(
  worker: Worker,
  predicate: (line: string) => boolean,
  onLine: (line: string) => void = () => {},
  timeoutMs = 15_000,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleWorkerError);
      worker.removeEventListener("messageerror", handleMessageError);
      signal?.removeEventListener("abort", handleAbort);
    };

    const finish = (callback: () => void) => {
      if (settled) return;

      settled = true;
      cleanup();
      callback();
    };

    const handleMessage = (event: MessageEvent<unknown>) => {
      const line =
        typeof event.data === "string" ? event.data.trim() : "";

      if (!line) return;

      onLine(line);

      if (predicate(line)) {
        finish(() => resolve(line));
      }
    };

    const handleWorkerError = (event: ErrorEvent) => {
      const message =
        event.message || "The Stockfish worker encountered an error.";

      finish(() => reject(new Error(message)));
    };

    const handleMessageError = () => {
      finish(() => {
        reject(new Error("Could not read a message from Stockfish."));
      });
    };

    const handleAbort = () => {
      finish(() => reject(abortError()));
    };

    const timeoutId = window.setTimeout(() => {
      finish(() => {
        reject(
          new Error(
            "Stockfish timed out. Try a shorter game or a lower search depth.",
          ),
        );
      });
    }, timeoutMs);

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleWorkerError);
    worker.addEventListener("messageerror", handleMessageError);
    signal?.addEventListener("abort", handleAbort, { once: true });

    if (signal?.aborted) {
      handleAbort();
    }
  });
}

function uciToSan(fen: string, uci: string): string {
  if (!uci || uci === "(none)" || uci === "0000") {
    return "No legal move";
  }

  try {
    const chess = new Chess(fen);

    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });

    return move?.san ?? uci;
  } catch {
    return uci;
  }
}

function parseBestScore(line: string): EngineScore | null {
  const depthMatch = line.match(/\bdepth\s+(\d+)/);
  const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);

  if (!depthMatch || !scoreMatch) {
    return null;
  }

  return {
    depth: Number(depthMatch[1]),
    type: scoreMatch[1] as "cp" | "mate",
    value: Number(scoreMatch[2]),
  };
}

function toWhitePerspective(
  score: EngineScore,
  sideToMove: "w" | "b",
): {
  evaluationCpWhite: number | null;
  mateInWhite: number | null;
} {
  const sign = sideToMove === "w" ? 1 : -1;

  if (score.type === "mate") {
    return {
      evaluationCpWhite: null,
      mateInWhite: score.value * sign,
    };
  }

  return {
    evaluationCpWhite: (score.value * sign) / 100,
    mateInWhite: null,
  };
}

function toComparablePawns(
  evaluation: Pick<
    PositionResult,
    "evaluationCpWhite" | "mateInWhite"
  >,
): number | null {
  if (evaluation.evaluationCpWhite !== null) {
    return evaluation.evaluationCpWhite;
  }

  if (evaluation.mateInWhite !== null) {
    // A bounded approximation lets mate scores participate in move
    // classification. It is not a literal centipawn conversion.
    const distance = Math.min(Math.abs(evaluation.mateInWhite), 99);
    const magnitude = 100 - distance;

    if (evaluation.mateInWhite > 0) return magnitude;
    if (evaluation.mateInWhite < 0) return -magnitude;

    return 0;
  }

  return null;
}

function classifyMove(
  before: PositionResult,
  after: PositionResult,
  mover: "w" | "b",
): {
  evaluationLossPawns: number | null;
  classification: MoveClassification;
} {
  const beforeScore = toComparablePawns(before);
  const afterScore = toComparablePawns(after);

  if (beforeScore === null || afterScore === null) {
    return {
      evaluationLossPawns: null,
      classification: "unrated",
    };
  }

  // All evaluations use White's perspective. Reverse the subtraction
  // for Black so that a positive loss always means a worse move.
  const rawLoss =
    mover === "w"
      ? beforeScore - afterScore
      : afterScore - beforeScore;

  const evaluationLossPawns = Math.max(0, rawLoss);

  if (evaluationLossPawns >= BLUNDER_THRESHOLD) {
    return { evaluationLossPawns, classification: "blunder" };
  }

  if (evaluationLossPawns >= MISTAKE_THRESHOLD) {
    return { evaluationLossPawns, classification: "mistake" };
  }

  if (evaluationLossPawns >= INACCURACY_THRESHOLD) {
    return { evaluationLossPawns, classification: "inaccuracy" };
  }

  return { evaluationLossPawns, classification: "good" };
}

function getSearchDepth(plies: number): number {
  if (plies > LONG_GAME_PLIES) {
    return LONG_GAME_SEARCH_DEPTH;
  }

  if (plies > MEDIUM_GAME_PLIES) {
    return MEDIUM_GAME_SEARCH_DEPTH;
  }

  return STANDARD_SEARCH_DEPTH;
}

async function analysePosition(
  worker: Worker,
  position: PositionRecord,
  searchDepth: number,
  signal: AbortSignal,
): Promise<PositionResult> {
  checkAborted(signal);

  const latestScore: { value: EngineScore | null } = { value: null };

  worker.postMessage(`position fen ${position.fen}`);

  // Attach listeners before starting the search so fast responses
  // cannot be missed.
  const search = waitForLine(
    worker,
    (line) => line.startsWith("bestmove "),
    (line) => {
      if (!line.startsWith("info ")) return;

      const score = parseBestScore(line);

      if (
        score &&
        (!latestScore.value || score.depth >= latestScore.value.depth)
      ) {
        latestScore.value = score;
      }
    },
    ENGINE_TIMEOUT_MS,
    signal,
  );

  worker.postMessage(`go depth ${searchDepth}`);

  const bestMoveLine = await search;

  checkAborted(signal);

  const bestMoveMatch = bestMoveLine.match(/^bestmove\s+(\S+)/);
  const bestMoveUci = bestMoveMatch?.[1] ?? "";

  const evaluation = latestScore.value
    ? toWhitePerspective(latestScore.value, position.sideToMove)
    : { evaluationCpWhite: null, mateInWhite: null };

  return {
    bestMoveUci,
    ...evaluation,
    depth: latestScore.value?.depth ?? 0,
  };
}

export async function analyzeGamePositions(
  initialFen: string,
  sanMoves: string[],
  onProgress: ProgressCallback,
  signal: AbortSignal,
): Promise<MoveAnalysis[]> {
  checkAborted(signal);

  if (sanMoves.length === 0) {
    onProgress(0, 0);
    return [];
  }

  const replay = new Chess(initialFen);
  const positions: PositionRecord[] = [];

  // Save the position before each move.
  for (let index = 0; index < sanMoves.length; index += 1) {
    checkAborted(signal);

    const fen = replay.fen();
    const sideToMove = replay.turn();
    const played = replay.move(sanMoves[index]);

    if (!played) {
      throw new Error(`Could not replay PGN move ${index + 1}.`);
    }

    positions.push({
      fen,
      sideToMove,
      ply: index + 1,
      moveNumber: Math.floor(index / 2) + 1,
      color: sideToMove,
      playedSan: played.san,
      playedMoveUci:
        played.from + played.to + (played.promotion ?? ""),
    });
  }

  // Also analyse the final position so the last played move can be
  // compared with the position it actually produced.
  positions.push({
    fen: replay.fen(),
    sideToMove: replay.turn(),
  });

  const searchDepth = getSearchDepth(sanMoves.length);
  const positionResults: PositionResult[] = [];
  let worker: Worker;

  try {
    worker = new Worker(ENGINE_PATH);
  } catch {
    throw new Error(
      "Could not start Stockfish. Check that its JavaScript engine file exists in public/stockfish.",
    );
  }

  try {
    checkAborted(signal);

    const uciReady = waitForLine(
      worker,
      (line) => line === "uciok",
      () => {},
      ENGINE_START_TIMEOUT_MS,
      signal,
    );

    worker.postMessage("uci");
    await uciReady;

    checkAborted(signal);

    const engineReady = waitForLine(
      worker,
      (line) => line === "readyok",
      () => {},
      ENGINE_START_TIMEOUT_MS,
      signal,
    );

    worker.postMessage("isready");
    await engineReady;

    for (let index = 0; index < positions.length; index += 1) {
      checkAborted(signal);

      const result = await analysePosition(
        worker,
        positions[index],
        searchDepth,
        signal,
      );

      positionResults.push(result);
      onProgress(index + 1, positions.length);
    }

    checkAborted(signal);

    const analyses: MoveAnalysis[] = [];

    for (let index = 0; index < sanMoves.length; index += 1) {
      const position = positions[index];
      const before = positionResults[index];
      const after = positionResults[index + 1];

      const moveQuality = classifyMove(
        before,
        after,
        position.color!,
      );

      analyses.push({
        ply: position.ply!,
        moveNumber: position.moveNumber!,
        color: position.color!,
        playedSan: position.playedSan!,
        playedMoveUci: position.playedMoveUci!,
        fen: position.fen,
        bestMoveUci: before.bestMoveUci,
        bestMoveSan: uciToSan(position.fen, before.bestMoveUci),
        evaluationCpWhite: before.evaluationCpWhite,
        mateInWhite: before.mateInWhite,
        evaluationAfterCpWhite: after.evaluationCpWhite,
        mateAfterInWhite: after.mateInWhite,
        evaluationLossPawns: moveQuality.evaluationLossPawns,
        classification: moveQuality.classification,
        depth: before.depth,
      });
    }

    return analyses;
  } finally {
    // Terminating the worker also stops any engine work still running
    // after cancellation or an error.
    worker.terminate();
  }
}
