export default function Navbar() {
  return (
    <header className="nav" id="nav">
      <div className="shell nav-inner">
        <a className="brand" href="#top" data-magnet data-scroll="top">
          <img src="/sreevaai-logo.png" alt="Sreeva AI" width="32" height="32" fetchPriority="high" />
          <span className="brand-name"><span className="brand-s">Sreeva</span><span className="brand-ai">AI</span></span>
        </a>
        <nav className="nav-links" id="navLinks" aria-label="Main navigation">
          <a href="#problem" data-section="problem" data-scroll="problem">Problem</a>
          <a href="#platform" data-section="platform" data-scroll="platform">Platform</a>
          <a href="#how" data-section="how" data-scroll="how">How it works</a>
          <a href="#compare" data-section="compare" data-scroll="compare">Comparison</a>
          <a href="#faq" data-section="faq" data-scroll="faq">FAQ</a>
        </nav>
        <div className="nav-cta">
          <a className="btn btn-ghost" href="/login">Sign in</a>
          <a className="btn btn-ink" href="https://cal.com/vamsivk/30min" data-magnet>
            <span>Book demo</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}
