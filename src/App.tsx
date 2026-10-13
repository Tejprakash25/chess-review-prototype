
import { useState, type FormEvent } from "react";
import LegalNotices from "./components/LegalNotices";
import {
  getPlayerProfile,
  ChessComApiError,
  type ChessComProfileResult,
} from "./services/chesscomApi";

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

function App() {
  const [username, setUsername] = useState("");
  const [isCheckingPlayer, setIsCheckingPlayer] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [playerResult, setPlayerResult] =
    useState<ChessComProfileResult | null>(null);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const normalizedUsername = username.trim();

    setErrorMessage("");
    setStatusMessage("");
    setPlayerResult(null);

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

      if (result.archives.length === 0) {
        setStatusMessage(
          `Player @${result.player.username} was found, but no public game archives are available.`,
        );
      } else {
        setStatusMessage(
          `Player verified. Found ${result.archives.length} monthly game archive(s).`,
        );
      }
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
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <a
          className="wordmark"
          href="/"
          aria-label="Chess Review home"
        >
          <span className="brand-mark" aria-hidden="true">
            ♞
          </span>
          <span>
            CHESS <strong>REVIEW</strong>
          </span>
        </a>

        <span className="topbar-note">
          Understand every move
        </span>
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
            positions, and understand your decisions. Turn every
            game into an opportunity to improve.
          </p>

          <div className="hero-actions">
            <a
              className="primary-cta"
              href="#username-form"
              aria-label="Review a game by entering your Chess.com username"
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
            <h2 id="username-title">
              Find your Chess.com profile
            </h2>
            <p>
              Enter your public Chess.com username to check your
              profile and available game archives.
            </p>
          </div>

          <form
            id="username-form"
            className="username-form"
            onSubmit={handleSubmit}
            noValidate
          >
            <label htmlFor="chess-username">
              Chess.com username
            </label>

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
                  errorMessage
                    ? "username-error"
                    : "username-hint"
                }
                disabled={isCheckingPlayer}
                required
                minLength={3}
                maxLength={25}
              />

              <button
                className="primary-cta"
                type="submit"
                disabled={isCheckingPlayer}
              >
                {isCheckingPlayer
                  ? "Checking..."
                  : "Find my games"}
              </button>
            </div>

            <p id="username-hint" className="form-hint">
              Use your Chess.com username, not your email address.
              Only publicly available profile and archive data is
              requested.
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
              <p
                className="form-message"
                role="status"
                aria-live="polite"
              >
                {statusMessage}
              </p>
            )}
          </form>

          {playerResult && (
            <section
              className="player-result glass-panel"
              aria-labelledby="player-result-title"
              aria-live="polite"
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

                  <p>
                    @{playerResult.player.username}
                    {playerResult.player.title
                      ? ` · ${playerResult.player.title}`
                      : ""}
                  </p>
                </div>
              </div>

              <p>
                <strong>{playerResult.archives.length}</strong>{" "}
                monthly game archive(s) available
              </p>

              {playerResult.archives.length > 0 && (
                <p className="form-hint">
                  Your profile is verified. Selecting and reviewing
                  individual games is the next development step.
                </p>
              )}

              {playerResult.player.url && (
                <a
                  href={playerResult.player.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Chess.com profile
                  <span aria-hidden="true"> ↗</span>
                </a>
              )}
            </section>
          )}
        </section>

        <section
          className="workflow"
          aria-labelledby="workflow-title"
        >
          <div className="section-heading">
            <p className="eyebrow">THE PROCESS</p>
            <h2 id="workflow-title">
              From moves to meaningful insights
            </h2>
          </div>

          <div className="feature-list">
            {features.map((feature) => (
              <article
                className="feature-item glass-panel"
                key={feature.number}
              >
                <span className="feature-number">
                  {feature.number}
                </span>

                <div className="feature-copy">
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </div>

                <span
                  className="feature-arrow"
                  aria-hidden="true"
                >
                  ↗
                </span>
              </article>
            ))}
          </div>
        </section>

        <LegalNotices />
      </main>

      <footer className="footer">
        <p>
          Chess Review · Built to help you understand your game.
        </p>
        <p>Independent prototype, not affiliated with Chess.com.</p>
      </footer>
    </div>
  );
}

export default App;
