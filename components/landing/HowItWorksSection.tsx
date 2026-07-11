export default function HowItWorksSection() {
  return (
    <section className="how" id="how" data-section-anchor="how">
      <div className="shell">
        <div className="sec-head">
          <h2 className="display-h2" data-words data-reveal>
            How <span className="ital" style={{ color: "var(--primary)" }}>Ishitha</span> gets you from
            <br />JD to <span className="ital" style={{ color: "var(--primary)" }}>report.</span>
          </h2>
        </div>
      </div>

      <div className="shell how-shell">
        <div className="how-rail">
          <div className="how-rail-inner" id="howRail">
            <div className="rail-track">
              <div className="rail-fill" id="railFill"></div>
            </div>
            <ol className="rail-steps">
              <li className="rs" data-step="0">
                <span className="rs-n serif">01</span>
                <div>
                  <h4>Upload your JD</h4>
                  <p>Sreeva reads it and figures out what actually matters for this role, so it knows what to ask
                    before the interview even starts.</p>
                </div>
              </li>
              <li className="rs" data-step="1">
                <span className="rs-n serif">02</span>
                <div>
                  <h4>Invite candidates or upload resumes</h4>
                  <p>They get a link, click it, and Ishitha is waiting on the other end. No back and forth emails, no
                    &quot;does Thursday work for you?&quot;</p>
                </div>
              </li>
              <li className="rs" data-step="2">
                <span className="rs-n serif">03</span>
                <div>
                  <h4>Frictionless scheduling.</h4>
                  <p>No calendar Tetris. Candidates receive a unique link and simply select a time that works for them.
                    Ishitha is available 24/7.</p>
                </div>
              </li>
              <li className="rs" data-step="3">
                <span className="rs-n serif">04</span>
                <div>
                  <h4>20 minutes. A real conversation.</h4>
                  <p>Ishitha listens to every answer and decides what to ask next. If something sounds vague, she goes
                    deeper. If a claim doesn&apos;t add up, she pushes on it.</p>
                </div>
              </li>
              <li className="rs" data-step="4">
                <span className="rs-n serif">05</span>
                <div>
                  <h4>You get the verdict.</h4>
                  <p>Open the report and everything is already there: what they said, where they struggled, and whether
                    you should move them forward.</p>
                </div>
              </li>
            </ol>
          </div>
        </div>

        <div className="how-visual">
          <div className="how-stage" id="howStage">
            <span className="stage-counter" aria-hidden="true"><span id="stageCount">01</span><span
              className="stage-counter-sep">/</span>05</span>

            <div className="frame frame-1" data-frame="0">
              <div className="f-head"><span>upload.sreeva.ai</span></div>
              <div className="upload-drop">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="m17 8-5-5-5 5" />
                  <path d="M12 3v12" />
                </svg>
                <div>Drop the JD or<br /><b>paste a link</b></div>
              </div>
              <div className="upload-meta">
                <div className="um-row">
                  <span className="um-l">File</span>
                  <span className="um-v">senior-frontend-engineer.pdf</span>
                  <span className="um-tag ok">parsed</span>
                </div>
                <div className="um-row">
                  <span className="um-l">Role</span>
                  <span className="um-v">Senior Frontend IC4</span>
                  <span className="um-tag">detected</span>
                </div>
                <div className="um-row">
                  <span className="um-l">Time</span>
                  <span className="um-v mono">3.2s</span>
                  <span className="um-tag ok">ready</span>
                </div>
              </div>
              <div className="extracted">
                <div className="ex-h">Extracted · 11 skill anchors</div>
                <div className="ex-chips">
                  <span>React</span><span>TypeScript</span><span>System design</span>
                  <span>GraphQL</span><span>Performance</span><span>Accessibility</span>
                  <span>Testing</span><span>+4</span>
                </div>
              </div>
            </div>

            <div className="frame frame-2" data-frame="1">
              <div className="f-head"><span>Active Campaign</span></div>
              <div className="camp-top"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 0 16px", borderBottom: "1px solid rgba(0,0,0,0.05)", paddingBottom: "12px" }}>
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--ink)" }}>Senior Backend Engineer</div>
                  <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>2 candidates waiting</div>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    style={{ fontSize: "11px", fontWeight: 600, padding: "6px 10px", borderRadius: "6px", background: "rgba(0,0,0,0.04)", color: "var(--ink)", border: "1px solid rgba(0,0,0,0.05)", cursor: "default" }}>+
                    Drop Resumes Here</button>
                  <button
                    style={{ fontSize: "11px", fontWeight: 600, padding: "6px 10px", borderRadius: "6px", background: "var(--primary)", color: "#fff", border: "1px solid var(--primary-deep)", boxShadow: "0 2px 8px rgba(124,58,237,0.3)", cursor: "default" }}>Send
                    Invites</button>
                </div>
              </div>
              <div className="camp-list" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div
                  style={{ display: "grid", gridTemplateColumns: "1fr 60px", fontSize: "10px", fontFamily: "var(--mono)", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "0 4px 4px" }}>
                  <span>Candidate</span>
                  <span style={{ textAlign: "right" }}>Status</span>
                </div>
                <div
                  style={{ display: "grid", gridTemplateColumns: "1fr 60px", alignItems: "center", background: "rgba(0,0,0,0.02)", padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#3b82f6", color: "#fff", fontSize: "11px", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      AM</div>
                    <div>
                      <div style={{ fontSize: "13.5px", fontWeight: 500, color: "var(--ink)" }}>Arjun Mehta</div>
                      <div
                        style={{ fontSize: "11px", color: "var(--muted)", display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                          <polyline points="10 9 9 9 8 9" />
                        </svg>
                        arjun_resume.pdf
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span
                      style={{ fontSize: "10px", fontFamily: "var(--mono)", fontWeight: 600, color: "var(--green)", background: "var(--green-tint)", padding: "3px 8px", borderRadius: "999px" }}>Ready</span>
                  </div>
                </div>
                <div
                  style={{ display: "grid", gridTemplateColumns: "1fr 60px", alignItems: "center", background: "rgba(0,0,0,0.02)", padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#ec4899", color: "#fff", fontSize: "11px", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      PK</div>
                    <div>
                      <div style={{ fontSize: "13.5px", fontWeight: 500, color: "var(--ink)" }}>Priya Kapoor</div>
                      <div
                        style={{ fontSize: "11px", color: "var(--muted)", display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                          <polyline points="10 9 9 9 8 9" />
                        </svg>
                        priya_cv_new.pdf
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span
                      style={{ fontSize: "10px", fontFamily: "var(--mono)", fontWeight: 600, color: "var(--green)", background: "var(--green-tint)", padding: "3px 8px", borderRadius: "999px" }}>Ready</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="frame frame-3" data-frame="2">
              <div className="f-head"><span>Select Interview Time</span></div>
              <div
                style={{ padding: "20px", display: "flex", flexDirection: "column", height: "calc(100% - 40px)", boxSizing: "border-box" }}>
                <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--ink)" }}>45 min technical screen</div>

                <div
                  style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink)", marginTop: "20px", marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>September</span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      color="var(--muted)">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </div>
                <div
                  style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", textAlign: "center", fontSize: "11px", marginBottom: "8px", color: "var(--muted)", fontWeight: 600 }}>
                  <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
                </div>
                <div
                  style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", textAlign: "center", fontSize: "13px", fontWeight: 500, color: "var(--ink)" }}>
                  <span style={{ color: "rgba(0,0,0,0.3)", padding: "8px 0" }}>10</span>
                  <span style={{ color: "rgba(0,0,0,0.3)", padding: "8px 0" }}>11</span>
                  <span style={{ color: "rgba(0,0,0,0.3)", padding: "8px 0" }}>12</span>
                  <span style={{ color: "rgba(0,0,0,0.3)", padding: "8px 0" }}>13</span>
                  <span style={{ color: "rgba(0,0,0,0.3)", padding: "8px 0" }}>14</span>
                  <span style={{ color: "rgba(0,0,0,0.3)", padding: "8px 0" }}>15</span>
                  <span style={{ color: "rgba(0,0,0,0.3)", padding: "8px 0" }}>16</span>
                  <span style={{ padding: "8px 0" }}>17</span>
                  <span style={{ padding: "8px 0" }}>18</span>
                  <span
                    style={{ padding: "8px 0", background: "var(--primary)", color: "#fff", borderRadius: "8px", fontWeight: 600, boxShadow: "0 2px 8px rgba(124,58,237,0.3)" }}>19</span>
                  <span style={{ padding: "8px 0" }}>20</span>
                  <span style={{ padding: "8px 0" }}>21</span>
                  <span style={{ padding: "8px 0" }}>22</span>
                  <span style={{ padding: "8px 0" }}>23</span>
                </div>

                <div style={{ marginTop: "auto", paddingTop: "16px", borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink)" }}>Available on Sept 19</div>
                  <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                    <span
                      style={{ flex: "1", textAlign: "center", fontSize: "12px", padding: "10px 0", border: "1px solid rgba(0,0,0,0.1)", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>10:00
                      AM</span>
                    <span
                      style={{ flex: "1", textAlign: "center", fontSize: "12px", padding: "10px 0", border: "1px solid var(--primary)", borderRadius: "8px", fontWeight: 600, cursor: "pointer", background: "var(--primary)", color: "#fff", boxShadow: "0 4px 12px rgba(124,58,237,0.2)" }}>1:30
                      PM</span>
                    <span
                      style={{ flex: "1", textAlign: "center", fontSize: "12px", padding: "10px 0", border: "1px solid rgba(0,0,0,0.1)", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>4:00
                      PM</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="frame frame-4 frame-dark" data-frame="3">
              <div className="f-head"><span>sreevaai.com/interview/a8291</span><span className="rec"><span
                className="rec-dot"></span> live</span></div>
              <div className="iv-q">
                <span className="iv-tag">ISHITHA</span>
                <p>Can you tell me about the most challenging part of the checkout flow rebuild you led?</p>
              </div>
              <div className="iv-a">
                <span className="iv-tag a">CANDIDATE</span>
                <p>Sure, the hardest part was managing state across the different payment integrations without causing
                  the whole page to re-render.</p>
              </div>
              <div className="iv-q">
                <span className="iv-tag">ISHITHA</span>
                <p>That makes sense. How did you end up solving the re-render issue with those integrations?</p>
              </div>
              <div className="iv-a">
                <span className="iv-tag a">CANDIDATE</span>
                <p>We pulled the payment state out of the global context and localized it, using React memo for the
                  heavier child components.</p>
              </div>
              <div className="iv-foot">
                <div className="wave-mini">
                  <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
                </div>
                <span>00:08:42</span>
              </div>
            </div>

            <div className="frame frame-5" data-frame="4">
              <div className="f-head"><span>app.sreevaai.com/admin/candidates</span></div>
              <div className="rp-top rp-top-link" id="reportSigninCta">
                <div>
                  <div className="rp-id">Rahul Sharma · Senior Backend Engineer</div>
                  <div className="rp-role" style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                    <span
                      style={{ fontFamily: "var(--mono)", fontSize: "10px", color: "var(--muted)", letterSpacing: ".08em" }}>COMBINED
                      SCORE</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: "10px", color: "var(--primary)", fontWeight: 600 }}>88 /
                      100</span>
                  </div>
                </div>
                <span className="rp-badge">Strong hire</span>
              </div>
              <div className="rp-score">
                <div className="rp-num serif">88</div>
                <div className="rp-bars">
                  <div><span>Technical depth</span><i><b style={{ "--w": "91%" } as React.CSSProperties}></b></i><em>91</em></div>
                  <div><span>Problem solving</span><i><b style={{ "--w": "86%" } as React.CSSProperties}></b></i><em>86</em></div>
                  <div><span>Communication</span><i><b style={{ "--w": "84%" } as React.CSSProperties}></b></i><em>84</em></div>
                  <div><span>Integrity</span><i><b style={{ "--w": "100%" } as React.CSSProperties}></b></i><em>100</em></div>
                </div>
              </div>
              <div
                style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", background: "rgba(0,0,0,0.02)", borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                <div>
                  <div
                    style={{ fontSize: "11px", fontWeight: 700, color: "#27c93f", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                      strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Strengths
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--ink)", lineHeight: "1.5", paddingLeft: "20px" }}>
                    • Deep understanding of distributed systems architecture.<br />
                    • Strong, proactive problem solving and debugging skills.
                  </div>
                </div>
                <div style={{ height: "1px", background: "rgba(0,0,0,0.04)", margin: "2px 0" }}></div>
                <div>
                  <div
                    style={{ fontSize: "11px", fontWeight: 700, color: "#ff5f56", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                      strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                    Weaknesses
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--ink)", lineHeight: "1.5", paddingLeft: "20px" }}>
                    • Hesitant on resolving caching invalidation edge cases.<br />
                    • Slightly over-reliant on ORM default configurations.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
