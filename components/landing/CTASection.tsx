export default function CTASection() {
  return (
    <section className="cta" id="contact" data-section-anchor="contact">
      <div className="shell">
        <div className="cta-card" data-reveal>
          <div className="cta-grid-bg" aria-hidden="true"></div>
          <div className="cta-inner">
            <h2 className="cta-h">See exactly what your<br />candidates <span className="ital"
              style={{ color: "var(--primary)" }}>actually know.</span></h2>
            <p className="cta-p">Book a 30-minute walkthrough. We&apos;ll run Ishitha on a real role from your pipeline. You&apos;ll
              see the interview, the probes, and the report. Live.</p>
            <div className="cta-buttons" style={{ margin: "0 auto", justifyContent: "center" }}>
              <a className="btn btn-primary btn-lg" href="https://cal.com/vamsivk/30min" data-magnet>
                <span>Book a demo</span>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
