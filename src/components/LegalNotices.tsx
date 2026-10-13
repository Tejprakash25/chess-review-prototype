function LegalNotices() {
  return (
    <section className="legal-section" aria-label="Legal information">
      <nav className="legal-nav" aria-label="Legal pages">
        <a href="#privacy-policy">Privacy policy</a>
        <a href="#terms-and-conditions">Terms &amp; conditions</a>
      </nav>

      <article
        className="legal-card glass-panel"
        id="privacy-policy"
        aria-labelledby="privacy-title"
      >
        <p className="eyebrow">YOUR DATA</p>
        <h2 id="privacy-title">Privacy policy</h2>
        <p className="legal-updated">Last updated: October 13, 2026</p>

        <h3>1. Information we process</h3>
        <p>
          The current prototype accepts a Chess.com username and
          checks its format in your browser. It does not currently
          submit that username to a server or persist it through
          the application.
        </p>

        <h3>2. How information is used</h3>
        <p>
          Username input is used only for local form validation in
          this prototype. Actual account lookup and game retrieval
          are not yet implemented.
        </p>

        <h3>3. Storage and sharing</h3>
        <p>
          The current prototype does not intentionally store
          usernames in an application database or use analytics
          to track visitors. Hosting providers may process
          technical request data under their own policies.
        </p>

        <h3>4. Third-party services</h3>
        <p>
          Future versions may retrieve public game records through
          Chess.com's documented API and analyze games with
          Stockfish. Any resulting data transfers, processing
          and applicable third-party terms will be disclosed
          before those features are released.
        </p>

        <h3>5. Cookies and tracking</h3>
        <p>
          The current application does not intentionally set
          tracking cookies. This statement must be reviewed if
          analytics, authentication or other third-party services
          are introduced.
        </p>

        <h3>6. Your choices and contact</h3>
        <p>
          Do not enter passwords, account credentials or other
          sensitive information. A public contact address for
          privacy requests will be published before public launch.
        </p>
      </article>

      <article
        className="legal-card glass-panel"
        id="terms-and-conditions"
        aria-labelledby="terms-title"
      >
        <p className="eyebrow">RESPONSIBLE USE</p>
        <h2 id="terms-title">Terms &amp; conditions</h2>
        <p className="legal-updated">Last updated: October 13, 2026</p>

        <h3>1. Purpose</h3>
        <p>
          Chess Review is an independent prototype intended to
          support the review and educational analysis of completed
          chess games. Features may change during development.
        </p>

        <h3>2. Permitted use</h3>
        <p>
          Use the service lawfully and respect the terms, access
          restrictions and applicable policies of third-party
          services. Do not attempt to bypass access controls,
          overload external services or misuse other people's data.
        </p>

        <h3>3. Completed games only</h3>
        <p>
          The intended purpose is post-game analysis, not assistance
          during live games. Users are responsible for complying
          with the rules of any chess platform or competition.
        </p>

        <h3>4. Analysis limitations</h3>
        <p>
          Chess evaluations and suggested moves may be incomplete
          or inaccurate. Analysis is provided for informational
          and educational purposes, without a guarantee of results.
        </p>

        <h3>5. Third-party software and services</h3>
        <p>
          Future versions may use Chess.com's documented public API
          and the Stockfish chess engine. Those services and
          software are subject to their respective terms and
          licenses. This project is not affiliated with or endorsed
          by Chess.com.
        </p>

        <h3>6. Intellectual property</h3>
        <p>
          Third-party names, software, trademarks and game records
          remain subject to their applicable rights and terms.
          Do not assume that public availability grants unrestricted
          permission to copy, redistribute or commercially use data.
        </p>

        <h3>7. Availability and changes</h3>
        <p>
          The prototype is provided as-is during development.
          Features may be changed or withdrawn. Any limitations
          of liability or other legal provisions will be finalized
          in accordance with applicable law before public launch.
        </p>

        <h3>8. Contact and updates</h3>
        <p>
          Official contact details and any applicable governing-law
          provisions will be added before public release. Updated
          terms will be published on this page.
        </p>
      </article>
    </section>
  );
}

export default LegalNotices;
