export default function ComparisonSection() {
  return (
    <section className="compare" id="compare" data-section-anchor="compare">
      <div className="shell">
        <div className="sec-head" style={{ textAlign: "center", margin: "0 auto 64px" }}>
          <h2 className="display-h2" data-words data-reveal>
            What changes when<br /><span className="ital" style={{ color: "var(--primary)" }}>Ishitha runs the screen.</span>
          </h2>
          <p className="lede" data-reveal data-delay="2" style={{ marginLeft: "auto", marginRight: "auto" }}>
            Most tools record the interview. Sreeva <span className="serif-i" style={{ color: "var(--ink)" }}>conducts</span> it,
            and hands you the verdict.
          </p>
        </div>

        <div className="cmp" data-reveal>
          <div className="cmp-head">
            <div>What matters</div>
            <div>Traditional screening</div>
            <div className="cmp-srv">Sreeva AI</div>
          </div>
          <div className="cmp-row">
            <div className="cmp-a">How depth is measured</div>
            <div className="cmp-t"><span className="cross"></span>Passed/failed test cases or static code submission</div>
            <div className="cmp-s"><span className="tick"></span>Live conversational probing that keeps going until the answer holds up</div>
          </div>
          <div className="cmp-row">
            <div className="cmp-a">Engineering time</div>
            <div className="cmp-t"><span className="cross"></span>60-90 min of a senior engineer per candidate</div>
            <div className="cmp-s"><span className="tick"></span>Zero. Ishitha runs every screen end to end</div>
          </div>
          <div className="cmp-row">
            <div className="cmp-a">Consistency</div>
            <div className="cmp-t"><span className="cross"></span>Varies by who&apos;s interviewing and how tired they are</div>
            <div className="cmp-s"><span className="tick"></span>Same structured depth for every candidate, every time</div>
          </div>
          <div className="cmp-row">
            <div className="cmp-a">Fraud &amp; integrity</div>
            <div className="cmp-t"><span className="cross"></span>No real-time detection. Trust and hope</div>
            <div className="cmp-s"><span className="tick"></span>12 behavioral signals scored live. Adaptive follow-ups expose gaps</div>
          </div>
          <div className="cmp-row">
            <div className="cmp-a">What you receive</div>
            <div className="cmp-t"><span className="cross"></span>A score. Maybe notes if they remembered to type them</div>
            <div className="cmp-s"><span className="tick"></span>Per-skill scores, verbatim evidence with timestamps, resume credibility</div>
          </div>
          <div className="cmp-row">
            <div className="cmp-a">Time to decision</div>
            <div className="cmp-t"><span className="cross"></span>Days of back-and-forth after the screen</div>
            <div className="cmp-s"><span className="tick"></span>Full report ready the moment the call ends</div>
          </div>
        </div>
      </div>
    </section>
  );
}
