
export default function NotFound() {
  return (
    <main className="not-found-page">
      <section className="not-found-card glass-panel">
        <span className="not-found-code">404</span>

        <p className="eyebrow">PAGE NOT FOUND</p>

        <h1>This move leads nowhere.</h1>

        <p className="not-found-description">
          The page you’re looking for doesn’t exist or may have moved.
          Let’s get you back to the game.
        </p>

        <a className="primary-cta" href="/">
          Return to homepage <span aria-hidden="true">↗</span>
        </a>
      </section>
    </main>
  );
}
