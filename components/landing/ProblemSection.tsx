export default function ProblemSection() {
  return (
    <section className="problem" id="problem" data-section-anchor="problem"
      aria-label="The hiring problem Sreeva AI solves">
      <div className="shell">
        <div className="sec-head" style={{ textAlign: "center", marginInline: "auto" }}>
          <h2 className="display-h2" data-words data-reveal>
            First rounds are your<br /><span className="ital" style={{ color: "var(--primary)" }}>biggest blind spot.</span>
          </h2>
          <p className="lede" data-reveal data-delay="2" style={{ marginInline: "auto" }}>
            Resume keywords get candidates to the first call. What happens on that call determines everything, and
            right now, it is inconsistent, rushed, and expensive.
          </p>
        </div>

        <div className="problem-grid">
          <article className="prob-card" data-reveal>
            <div className="prob-num">
              <span className="serif">01</span>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </div>
            <h3 className="prob-h">It takes 2 weeks.</h3>
            <p className="prob-p">Scheduling a first-round technical screen means 6 emails, 3 calendars, and a Zoom link. By
              then, your best candidate has two other offers.</p>
            <div className="prob-stat"><b>13 days</b> Avg time from resume shortlist to first technical screen.</div>
          </article>

          <article className="prob-card" data-reveal data-delay="1">
            <div className="prob-num">
              <span className="serif">02</span>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </div>
            <h3 className="prob-h">Every call is different.</h3>
            <p className="prob-p">Two engineers interviewing the same candidate ask completely different questions. One
              passes. One rejects. Neither knows why the other decided.</p>
            <div className="prob-stat"><b>3.4&times;</b> Score variance for the same candidate across interviewers.</div>
          </article>

          <article className="prob-card" data-reveal data-delay="2">
            <div className="prob-num">
              <span className="serif">03</span>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </div>
            <h3 className="prob-h">Depth is easy to fake.</h3>
            <p className="prob-p">A candidate who&apos;s rehearsed their resume can sound confident for 20 minutes. Ishitha
              doesn&apos;t do surface-level &mdash; she follows every claim until it holds or breaks.</p>
            <div className="prob-stat"><b>1 in 3</b> &quot;Strong&quot; claims collapse under Ishitha&apos;s second follow-up.
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
