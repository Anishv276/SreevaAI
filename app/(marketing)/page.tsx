// @ts-nocheck
"use client";

import { useEffect, useState, useMemo } from 'react';
import Script from 'next/script';

const WORKING_DAYS_PER_MONTH = 20;

function formatHoursMinutes(totalMinutes) {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function formatMoney(amount) {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

function RoiCalculator() {
  const [teamSize, setTeamSize] = useState(8);
  const [callsPerDay, setCallsPerDay] = useState(4);
  const [avgCallLength, setAvgCallLength] = useState(30);
  const [reviewTime, setReviewTime] = useState(15);
  const [hourlyCost, setHourlyCost] = useState(600);

  const { hoursBack, moneyBack, callsPerMonth } = useMemo(() => {
    // Ishita conducts the call and writes the report, so the full call time
    // plus the notes/review time your team currently spends disappears.
    const currentMinutesPerCall = Number(avgCallLength) + Number(reviewTime);
    const calls = Number(teamSize) * Number(callsPerDay) * WORKING_DAYS_PER_MONTH;
    const minutesSaved = currentMinutesPerCall * calls;
    const hoursSaved = minutesSaved / 60;
    const money = hoursSaved * Number(hourlyCost);
    return {
      hoursBack: formatHoursMinutes(minutesSaved),
      moneyBack: formatMoney(money),
      callsPerMonth: calls,
    };
  }, [teamSize, callsPerDay, avgCallLength, reviewTime, hourlyCost]);

  const slider = (label, value, setValue, min, max, step, suffix) => (
    <div className="roi-field">
      <div className="roi-field-top">
        <span className="roi-field-label">{label}</span>
        <span className="roi-field-value">{value}{suffix}</span>
      </div>
      <input
        type="range"
        className="roi-field-slider"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setValue(Number(e.target.value))}
        style={{ "--roi-fill": `${((value - min) / (max - min)) * 100}%` }}
      />
    </div>
  );

  return (
    <section className="roi" id="roi" data-section-anchor="roi" aria-label="Time and cost savings calculator">
      <div className="shell">
        <div className="sec-head" style={{ textAlign: "center", margin: "0 auto 48px" }}>
          <span className="eyebrow roi-eyebrow" data-reveal>Talent team calculator</span>
          <h2 className="display-h2" data-words data-reveal>
            What screening is <span className="ital" style={{ color: "var(--primary)" }}>actually costing</span> your team.
          </h2>
          <p className="lede" data-reveal data-delay="2" style={{ marginLeft: "auto", marginRight: "auto" }}>
            Drag the sliders to match how your talent team runs first-round calls today.
          </p>
        </div>

        <div className="roi-panel" data-reveal>
          <div className="roi-inputs">
            {slider("Talent team headcount", teamSize, setTeamSize, 1, 100, 1, "")}
            {slider("First-round calls per recruiter, per day", callsPerDay, setCallsPerDay, 1, 20, 1, "")}
            {slider("Average call length", avgCallLength, setAvgCallLength, 10, 90, 5, " min")}
            {slider("Notes + writeup time after each call", reviewTime, setReviewTime, 0, 60, 5, " min")}
            {slider("Fully-loaded recruiter cost", hourlyCost, setHourlyCost, 200, 3000, 50, "/hr")}
          </div>

          <div className="roi-result">
            <div className="roi-result-block">
              <span className="roi-result-label">Recruiter hours freed, per month</span>
              <span className="roi-result-value">{hoursBack}</span>
            </div>
            <div className="roi-result-divider"></div>
            <div className="roi-result-block">
              <span className="roi-result-label">Cost recovered, per month</span>
              <span className="roi-result-value roi-result-value-money">{moneyBack}</span>
            </div>
            <span className="roi-result-sub">across {callsPerMonth.toLocaleString()} first-round calls a month, run and written up by Ishita instead of your team</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function MarketingPage() {
  useEffect(() => {
    // Ported from index.html inline scripts


    const chatBody = document.getElementById("chat-stream-body");
    if (!chatBody) return;
    chatBody.innerHTML = '';

    let cancelled = false;

    function autoScroll() {
      const nearBottom = chatBody.scrollHeight - chatBody.scrollTop - chatBody.clientHeight < 80;
      if (nearBottom) chatBody.scrollTop = chatBody.scrollHeight;
    }

    const conversation = [
      { role: "CANDIDATE", colorClass: "candidate", text: "\"We rebuilt our checkout flow. Reduced drop-off by around 30%.\"" },
      { role: "ISHITA · ADAPTING", colorClass: "ishita", text: "\"What was specifically yours in that rebuild? What would not have shipped without you? Walk me through the hardest state problem you hit.\"" },
      { role: "CANDIDATE", colorClass: "candidate", text: "\"I owned the cart state machine. We had race conditions when users edited quantity while a payment was in flight.\"" },
      { role: "ISHITA · ADAPTING", colorClass: "ishita", text: "\"How did you detect that race condition in the first place, and what did the fix actually change?\"" },
      { role: "CANDIDATE", colorClass: "candidate", text: "\"Support tickets showed duplicate charges. I added an idempotency key and locked cart writes during checkout.\"" },
      { role: "ISHITA · ADAPTING", colorClass: "ishita", text: "\"If that lock failed under load, what would a user actually see?\"" }
    ];

    let msgIndex = 0;

    function typeText(element, text, speed, onComplete) {
      let charIndex = 0;
      element.innerHTML = '<span class="text-content"></span><span class="type-cursor"></span>';
      const textSpan = element.querySelector('.text-content');
      const cursor = element.querySelector('.type-cursor');

      const interval = setInterval(() => {
        if (cancelled) { clearInterval(interval); return; }
        if (charIndex < text.length) {
          textSpan.textContent += text.charAt(charIndex);
          charIndex++;
          autoScroll();
        } else {
          clearInterval(interval);
          cursor.style.display = 'none';
          if (onComplete) setTimeout(onComplete, 500);
        }
      }, speed);
    }

    function playStream() {
      if (cancelled) return;
      if (msgIndex >= conversation.length) {
        // Loop back after a delay
        setTimeout(() => {
          if (cancelled) return;
          chatBody.innerHTML = '';
          msgIndex = 0;
          playStream();
        }, 5000);
        return;
      }

      const msg = conversation[msgIndex];

      const bubble = document.createElement("div");
      bubble.className = "chat-bubble visible";

      const header = document.createElement("div");
      header.className = `chat-header ${msg.colorClass}`;

      const iconHTML = msg.colorClass === 'ishita'
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

      header.innerHTML = `${iconHTML} <span>${msg.role}</span>`;

      const content = document.createElement("div");
      content.className = "chat-content";

      bubble.appendChild(header);
      bubble.appendChild(content);
      chatBody.appendChild(bubble);
      autoScroll();

      // Speed variation based on role
      const speed = msg.colorClass === 'ishita' ? 25 : 35;

      typeText(content, msg.text, speed, () => {
        msgIndex++;
        autoScroll();
        playStream();
      });
    }

    const startTimer = setTimeout(playStream, 800);



    const pChatBody = document.getElementById("platform-chat-stream-body");
    if (!pChatBody) return;

    let pCancelled = false;

    function pAutoScroll() {
      const nearBottom = pChatBody.scrollHeight - pChatBody.scrollTop - pChatBody.clientHeight < 80;
      if (nearBottom) pChatBody.scrollTop = pChatBody.scrollHeight;
    }

    // Each turn: a message to type, then an optional signal chip once it completes.
    const pConversation = [
      { kind: 'message', role: "SREEVA · ADAPTING", colorClass: "ishita", text: "\"What happens if the event fails to fire or gets lost? How do you ensure the cache eventually matches the DB?\"" },
      { kind: 'signal', label: "Question asked" },
      { kind: 'message', role: "CANDIDATE", colorClass: "candidate", text: "\"We built a background reconciliation worker that scans the outbox table and retries unacknowledged events.\"" },
      { kind: 'signal', label: "Signal detected: systems thinking" },
      { kind: 'message', role: "SREEVA · ADAPTING", colorClass: "ishita", text: "\"What happens if two reconciliation runs fire at the same time for the same record?\"" },
      { kind: 'signal', label: "Question asked" },
      { kind: 'signal', label: "Follow-up adapted" }
    ];

    let pMsgIndex = 0;

    function typeTextPlatform(element, text, speed, onComplete) {
      let charIndex = 0;
      element.innerHTML = '<span class="text-content"></span><span class="type-cursor"></span>';
      const textSpan = element.querySelector('.text-content');
      const cursor = element.querySelector('.type-cursor');

      const interval = setInterval(() => {
        if (pCancelled) { clearInterval(interval); return; }
        if (charIndex < text.length) {
          textSpan.textContent += text.charAt(charIndex);
          charIndex++;
          pAutoScroll();
        } else {
          clearInterval(interval);
          cursor.style.display = 'none';
          if (onComplete) setTimeout(onComplete, 300);
        }
      }, speed);
    }

    function renderSignalChip(label) {
      const chip = document.createElement("div");
      chip.className = "signal-chip";
      chip.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#27c93f" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            <span>${label}</span>
          `;
      pChatBody.appendChild(chip);
      pAutoScroll();
      requestAnimationFrame(() => chip.classList.add("visible"));
    }

    function playPlatformStream() {
      if (pCancelled) return;
      if (pMsgIndex >= pConversation.length) {
        setTimeout(() => {
          if (pCancelled) return;
          pChatBody.innerHTML = '';
          pMsgIndex = 0;
          playPlatformStream();
        }, 4000);
        return;
      }

      const step = pConversation[pMsgIndex];

      if (step.kind === 'signal') {
        renderSignalChip(step.label);
        pMsgIndex++;
        setTimeout(playPlatformStream, 700);
        return;
      }

      const msg = step;

      const bubble = document.createElement("div");
      bubble.className = "chat-bubble visible";

      const header = document.createElement("div");
      header.className = `chat-header ${msg.colorClass}`;

      const iconHTML = msg.colorClass === 'ishita'
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

      header.innerHTML = `${iconHTML} <span>${msg.role}</span>`;

      const content = document.createElement("div");
      content.className = "chat-content";

      bubble.appendChild(header);
      bubble.appendChild(content);
      pChatBody.appendChild(bubble);
      pAutoScroll();

      const speed = msg.colorClass === 'ishita' ? 25 : 35;

      typeTextPlatform(content, msg.text, speed, () => {
        pMsgIndex++;
        pAutoScroll();
        playPlatformStream();
      });
    }

    let pObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setTimeout(playPlatformStream, 600);
        pObserver.disconnect();
      }
    }, { threshold: 0.3 });

    pObserver.observe(document.getElementById('platform'));

    return () => {
      cancelled = true;
      pCancelled = true;
      clearTimeout(startTimer);
      pObserver.disconnect();
    };

  }, []);

  return (
    <>


      {/*  Scroll progress bar  */}
      <div className="scroll-prog" id="scrollProg" aria-hidden="true"></div>

      {/*  Header  */}
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

      <main id="top" itemScope itemType="https://schema.org/WebPage">

        {/*  ========== HERO (Glossy Split Style) ==========  */}


        <section className="hero-glossy" data-section-anchor="hero">
          <div className="hero-split">
            <div className="hero-left">
              <h1 className="headline">Meet Ishitha
                <span className="role-rotator" id="roleRotator">
                  <span className="role-rotator-track" id="roleRotatorTrack">
                    <span className="ital" style={{ "color": "var(--primary)" }}>Adaptive AI Interviewer</span>
                    <span className="ital" style={{ "color": "var(--primary)" }}>First-Round Interviewer</span>
                    <span className="ital" style={{ "color": "var(--primary)" }}>AI Interviewer for Engineering Teams</span>
                  </span>
                </span>
              </h1>
              <p className="body-text">Ishita runs first-round technical interviews for engineering roles, adapts to
                what candidates actually say, and hands you a decision-ready report in 20 minutes.</p>

              <div className="cta-container">
                <a href="https://cal.com/vamsivk/30min" className="btn-primary-lg">Book a Demo</a>
              </div>
            </div>

            <div className="hero-right">
              <div className="sig-container">
                <div className="mock-window">
                  <div className="window-header">
                    <div className="dot dot-red"></div>
                    <div className="dot dot-yellow"></div>
                    <div className="dot dot-green"></div>
                  </div>
                  <div className="window-body" id="chat-stream-body">
                    {/*  Streamed chat will go here  */}
                  </div>
                  <div className="ui-footer" style={{ "padding": "12px 24px" }}>
                    <span
                      style={{ "fontSize": "0.875rem", "color": "rgba(255, 255, 255, 0.6)", "display": "flex", "alignItems": "center", "gap": "8px" }}>
                      <span
                        style={{ "width": "8px", "height": "8px", "background": "#27c93f", "borderRadius": "50%", "display": "inline-block", "boxShadow": "0 0 8px #27c93f" }}></span>
                      Sreeva AI Engine Active
                    </span>
                    <div className="shortcut">Live Interview</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bento">
            <div className="stat-card">
              <div className="stat-number">0%</div>
              <div className="stat-label">Scripted questions</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">20 min</div>
              <div className="stat-label">Fixed interview length</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">12</div>
              <div className="stat-label">Integrity signals tracked</div>
            </div>
          </div>

          <div className="shell" style={{ "marginTop": "80px", "position": "relative", "zIndex": "10" }}>
            <div style={{ "display": "flex", "flexWrap": "wrap", "gap": "48px", "alignItems": "center" }}>
              <div style={{ "flex": "1", "minWidth": "320px" }}>
                <h3
                  style={{ "fontFamily": "var(--sans)", "fontSize": "clamp(2rem, 3vw, 2.5rem)", "margin": "16px 0 20px", "fontWeight": "700", "letterSpacing": "-0.02em", "lineHeight": "1.1" }}>
                  See Sreeva in action.</h3>
                <p style={{ "fontSize": "1.125rem", "color": "var(--muted)", "lineHeight": "1.6" }}>Upload your Job Description, drop in
                  your candidates, and let Sreeva handle the rest. Launching a fully autonomous screening campaign takes
                  less than a minute.</p>
              </div>
              <div style={{ "flex": "1.5", "minWidth": "320px" }}>
                <div className="hero-video-wrapper"
                  style={{ "borderRadius": "24px", "overflow": "hidden", "boxShadow": "0 20px 40px rgba(0,0,0,0.08)", "border": "1px solid rgba(255,255,255,0.6)" }}>
                  <video width="100%" autoPlay loop muted playsInline style={{ "display": "block" }}>
                    <source src="/sreeva-vid.mp4" type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                </div>
              </div>
            </div>
          </div>
        </section>




        {/*  ========== PROBLEM ==========  */}
        <section className="problem" id="problem" data-section-anchor="problem"
          aria-label="The hiring problem Sreeva AI solves">
          <div className="shell">
            <div className="sec-head" style={{ "textAlign": "center", "marginInline": "auto" }}>
              <h2 className="display-h2" data-words data-reveal>
                First rounds are your<br /><span className="ital" style={{ "color": "var(--primary)" }}>biggest blind spot.</span>
              </h2>
              <p className="lede" data-reveal data-delay="2" style={{ "marginInline": "auto" }}>
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
                <p className="prob-p">A candidate who's rehearsed their resume can sound confident for 20 minutes. Ishita
                  doesn't do surface-level &mdash; she follows every claim until it holds or breaks.</p>
                <div className="prob-stat"><b>1 in 3</b> &quot;Strong&quot; claims collapse under Ishita's second follow-up.
                </div>
              </article>
            </div>
          </div>
        </section>

        {/*  ========== PLATFORM ==========  */}
        <section className="platform" id="platform" data-section-anchor="platform"
          aria-label="Sreeva AI platform features">
          <div className="shell">
            <div className="hero-split" style={{ "gap": "40px", "alignItems": "stretch" }}>
              {/*  Left side  */}
              <div className="hero-left" style={{ "justifyContent": "center", "maxWidth": "520px", "paddingRight": "20px" }}>
                <div className="sec-head" style={{ "marginBottom": "32px" }}>
                  <h2 className="display-h2" data-words data-reveal
                    style={{ "fontSize": "clamp(2rem, 2.8vw, 2.8rem)", "marginTop": "0", "lineHeight": "1.25" }}>
                    <span style={{ "color": "var(--primary)" }}>She listens.</span><br />
                    <span style={{ "color": "var(--primary)" }}>She follows up.</span><br />
                    No script.<br />
                    No template.
                  </h2>
                  <p className="lede" data-reveal data-delay="2" style={{ "fontSize": "1.05rem" }}>
                    Ishita isn't running through a checklist. She hears what the candidate says and decides what to ask
                    next. If they claim strong system design work, she asks about a specific failure. If they pivot away
                    from a question, she comes back. It is the interview your best engineer would run, if they had 3 hours
                    for every candidate.
                  </p>
                </div>

                <div className="bento" style={{ "gridTemplateColumns": "1fr", "marginTop": "0", "width": "100%" }}>
                  <div className="stat-card"
                    style={{ "padding": "24px", "textAlign": "left", "display": "flex", "flexDirection": "column", "gap": "16px" }}>
                    <div style={{ "display": "flex", "alignItems": "center", "gap": "20px" }}>
                      <div className="stat-number"
                        style={{ "fontSize": "2.5rem", "color": "var(--primary)", "margin": "0", "minWidth": "80px" }}>100%</div>
                      <div className="stat-label" style={{ "fontSize": "1rem", "lineHeight": "1.4", "color": "var(--ink)" }}>of
                        questions adapt to the answer</div>
                    </div>
                  </div>
                </div>
              </div>

              {/*  Right side  */}
              <div className="hero-right" style={{ "display": "flex", "alignItems": "center" }}>
                <div className="sig-container"
                  style={{ "background": "linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(124, 58, 237, 0.3) 100%)", "width": "100%" }}>
                  <div
                    style={{ "position": "absolute", "top": "16px", "left": "24px", "zIndex": "10", "fontFamily": "var(--sans)", "fontSize": "1.1rem", "fontWeight": "700", "color": "#fff", "textShadow": "0 2px 10px rgba(0,0,0,0.3)" }}>
                    Adaptive Probe in action</div>
                  <div className="mock-window" style={{ "marginTop": "36px", "display": "flex", "flexDirection": "column" }}>
                    <div className="window-header">
                      <div className="dot dot-red"></div>
                      <div className="dot dot-yellow"></div>
                      <div className="dot dot-green"></div>
                    </div>
                    <div className="window-body" id="platform-chat-stream-body"
                      style={{ "padding": "20px", "gap": "12px", "height": "320px", "overflowY": "auto", "scrollBehavior": "smooth" }}>
                      {/*  Streamed chat + signal chips will go here  */}
                    </div>
                    <div className="ui-footer"
                      style={{ "padding": "12px 24px", "background": "rgba(0,0,0,0.25)", "borderTop": "1px solid rgba(255,255,255,0.1)", "display": "flex", "alignItems": "center", "gap": "8px" }}>
                      <span style={{ "width": "8px", "height": "8px", "background": "#27c93f", "borderRadius": "50%", "display": "inline-block", "boxShadow": "0 0 8px #27c93f" }}></span>
                      <span style={{ "fontSize": "0.8rem", "color": "rgba(255,255,255,0.6)" }}>Sreeva AI Engine Active</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>



        {/*  ========== HOW IT WORKS (sticky scroll) ==========  */}
        <section className="how" id="how" data-section-anchor="how">
          <div className="shell">
            <div className="sec-head">
              <h2 className="display-h2" data-words data-reveal>
                How <span className="ital" style={{ "color": "var(--primary)" }}>Ishita</span> gets you from
                <br />JD to <span className="ital" style={{ "color": "var(--primary)" }}>report.</span>
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
                      <p>They get a link, click it, and Ishita is waiting on the other end. No back and forth emails, no
                        "does Thursday work for you?"</p>
                    </div>
                  </li>
                  <li className="rs" data-step="2">
                    <span className="rs-n serif">03</span>
                    <div>
                      <h4>Frictionless scheduling.</h4>
                      <p>No calendar Tetris. Candidates receive a unique link and simply select a time that works for them.
                        Ishita is available 24/7.</p>
                    </div>
                  </li>
                  <li className="rs" data-step="3">
                    <span className="rs-n serif">04</span>
                    <div>
                      <h4>20 minutes. A real conversation.</h4>
                      <p>Ishita listens to every answer and decides what to ask next. If something sounds vague, she goes
                        deeper. If a claim doesn't add up, she pushes on it.</p>
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
                {/*  Frame 1: JD upload  */}
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

                {/*  Frame 2: campaign management  */}
                <div className="frame frame-2" data-frame="1">
                  <div className="f-head"><span>Active Campaign</span></div>
                  <div className="camp-top"
                    style={{ "display": "flex", "justifyContent": "space-between", "alignItems": "center", "margin": "12px 0 16px", "borderBottom": "1px solid rgba(0,0,0,0.05)", "paddingBottom": "12px" }}>
                    <div>
                      <div style={{ "fontSize": "15px", "fontWeight": "600", "color": "var(--ink)" }}>Senior Backend Engineer</div>
                      <div style={{ "fontSize": "12px", "color": "var(--muted)", "marginTop": "2px" }}>2 candidates waiting</div>
                    </div>
                    <div style={{ "display": "flex", "gap": "8px" }}>
                      <button
                        style={{ "fontSize": "11px", "fontWeight": "600", "padding": "6px 10px", "borderRadius": "6px", "background": "rgba(0,0,0,0.04)", "color": "var(--ink)", "border": "1px solid rgba(0,0,0,0.05)", "cursor": "default" }}>+
                        Drop Resumes Here</button>
                      <button
                        style={{ "fontSize": "11px", "fontWeight": "600", "padding": "6px 10px", "borderRadius": "6px", "background": "var(--primary)", "color": "#fff", "border": "1px solid var(--primary-deep)", "boxShadow": "0 2px 8px rgba(124,58,237,0.3)", "cursor": "default" }}>Send
                        Invites</button>
                    </div>
                  </div>
                  <div className="camp-list" style={{ "display": "flex", "flexDirection": "column", "gap": "10px" }}>
                    <div
                      style={{ "display": "grid", "gridTemplateColumns": "1fr 60px", "fontSize": "10px", "fontFamily": "var(--mono)", "color": "var(--muted)", "textTransform": "uppercase", "letterSpacing": "0.05em", "padding": "0 4px 4px" }}>
                      <span>Candidate</span>
                      <span style={{ "textAlign": "right" }}>Status</span>
                    </div>
                    <div
                      style={{ "display": "grid", "gridTemplateColumns": "1fr 60px", "alignItems": "center", "background": "rgba(0,0,0,0.02)", "padding": "10px 12px", "borderRadius": "10px", "border": "1px solid rgba(0,0,0,0.04)" }}>
                      <div style={{ "display": "flex", "alignItems": "center", "gap": "12px" }}>
                        <div
                          style={{ "width": "28px", "height": "28px", "borderRadius": "50%", "background": "#3b82f6", "color": "#fff", "fontSize": "11px", "fontWeight": "600", "display": "flex", "alignItems": "center", "justifyContent": "center" }}>
                          AM</div>
                        <div>
                          <div style={{ "fontSize": "13.5px", "fontWeight": "500", "color": "var(--ink)" }}>Arjun Mehta</div>
                          <div
                            style={{ "fontSize": "11px", "color": "var(--muted)", "display": "flex", "alignItems": "center", "gap": "4px", "marginTop": "2px" }}>
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
                      <div style={{ "textAlign": "right" }}>
                        <span
                          style={{ "fontSize": "10px", "fontFamily": "var(--mono)", "fontWeight": "600", "color": "var(--green)", "background": "var(--green-tint)", "padding": "3px 8px", "borderRadius": "999px" }}>Ready</span>
                      </div>
                    </div>
                    <div
                      style={{ "display": "grid", "gridTemplateColumns": "1fr 60px", "alignItems": "center", "background": "rgba(0,0,0,0.02)", "padding": "10px 12px", "borderRadius": "10px", "border": "1px solid rgba(0,0,0,0.04)" }}>
                      <div style={{ "display": "flex", "alignItems": "center", "gap": "12px" }}>
                        <div
                          style={{ "width": "28px", "height": "28px", "borderRadius": "50%", "background": "#ec4899", "color": "#fff", "fontSize": "11px", "fontWeight": "600", "display": "flex", "alignItems": "center", "justifyContent": "center" }}>
                          PK</div>
                        <div>
                          <div style={{ "fontSize": "13.5px", "fontWeight": "500", "color": "var(--ink)" }}>Priya Kapoor</div>
                          <div
                            style={{ "fontSize": "11px", "color": "var(--muted)", "display": "flex", "alignItems": "center", "gap": "4px", "marginTop": "2px" }}>
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
                      <div style={{ "textAlign": "right" }}>
                        <span
                          style={{ "fontSize": "10px", "fontFamily": "var(--mono)", "fontWeight": "600", "color": "var(--green)", "background": "var(--green-tint)", "padding": "3px 8px", "borderRadius": "999px" }}>Ready</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/*  Frame 3: scheduling  */}
                <div className="frame frame-3" data-frame="2">
                  <div className="f-head"><span>Select Interview Time</span></div>
                  <div
                    style={{ "padding": "20px", "display": "flex", "flexDirection": "column", "height": "calc(100% - 40px)", "boxSizing": "border-box" }}>
                    <div style={{ "fontSize": "15px", "fontWeight": "600", "color": "var(--ink)" }}>45 min technical screen</div>

                    <div
                      style={{ "fontSize": "13px", "fontWeight": "600", "color": "var(--ink)", "marginTop": "20px", "marginBottom": "12px", "display": "flex", "alignItems": "center", "justifyContent": "space-between" }}>
                      <span>September</span>
                      <div style={{ "display": "flex", "gap": "8px" }}>
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
                      style={{ "display": "grid", "gridTemplateColumns": "repeat(7, 1fr)", "gap": "4px", "textAlign": "center", "fontSize": "11px", "marginBottom": "8px", "color": "var(--muted)", "fontWeight": "600" }}>
                      <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
                    </div>
                    <div
                      style={{ "display": "grid", "gridTemplateColumns": "repeat(7, 1fr)", "gap": "4px", "textAlign": "center", "fontSize": "13px", "fontWeight": "500", "color": "var(--ink)" }}>
                      <span style={{ "color": "rgba(0,0,0,0.3)", "padding": "8px 0" }}>10</span>
                      <span style={{ "color": "rgba(0,0,0,0.3)", "padding": "8px 0" }}>11</span>
                      <span style={{ "color": "rgba(0,0,0,0.3)", "padding": "8px 0" }}>12</span>
                      <span style={{ "color": "rgba(0,0,0,0.3)", "padding": "8px 0" }}>13</span>
                      <span style={{ "color": "rgba(0,0,0,0.3)", "padding": "8px 0" }}>14</span>
                      <span style={{ "color": "rgba(0,0,0,0.3)", "padding": "8px 0" }}>15</span>
                      <span style={{ "color": "rgba(0,0,0,0.3)", "padding": "8px 0" }}>16</span>
                      <span style={{ "padding": "8px 0" }}>17</span>
                      <span style={{ "padding": "8px 0" }}>18</span>
                      <span
                        style={{ "padding": "8px 0", "background": "var(--primary)", "color": "#fff", "borderRadius": "8px", "fontWeight": "600", "boxShadow": "0 2px 8px rgba(124,58,237,0.3)" }}>19</span>
                      <span style={{ "padding": "8px 0" }}>20</span>
                      <span style={{ "padding": "8px 0" }}>21</span>
                      <span style={{ "padding": "8px 0" }}>22</span>
                      <span style={{ "padding": "8px 0" }}>23</span>
                    </div>

                    <div style={{ "marginTop": "auto", "paddingTop": "16px", "borderTop": "1px solid rgba(0,0,0,0.05)" }}>
                      <div style={{ "fontSize": "13px", "fontWeight": "600", "color": "var(--ink)" }}>Available on Sept 19</div>
                      <div style={{ "display": "flex", "gap": "8px", "marginTop": "12px" }}>
                        <span
                          style={{ "flex": "1", "textAlign": "center", "fontSize": "12px", "padding": "10px 0", "border": "1px solid rgba(0,0,0,0.1)", "borderRadius": "8px", "fontWeight": "600", "cursor": "pointer" }}>10:00
                          AM</span>
                        <span
                          style={{ "flex": "1", "textAlign": "center", "fontSize": "12px", "padding": "10px 0", "border": "1px solid var(--primary)", "borderRadius": "8px", "fontWeight": "600", "cursor": "pointer", "background": "var(--primary)", "color": "#fff", "boxShadow": "0 4px 12px rgba(124,58,237,0.2)" }}>1:30
                          PM</span>
                        <span
                          style={{ "flex": "1", "textAlign": "center", "fontSize": "12px", "padding": "10px 0", "border": "1px solid rgba(0,0,0,0.1)", "borderRadius": "8px", "fontWeight": "600", "cursor": "pointer" }}>4:00
                          PM</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/*  Frame 4: interview  */}
                <div className="frame frame-4 frame-dark" data-frame="3">
                  <div className="f-head"><span>sreevaai.com/interview/a8291</span><span className="rec"><span
                    className="rec-dot"></span> live</span></div>
                  <div className="iv-q">
                    <span className="iv-tag">ISHITA</span>
                    <p>Can you tell me about the most challenging part of the checkout flow rebuild you led?</p>
                  </div>
                  <div className="iv-a">
                    <span className="iv-tag a">CANDIDATE</span>
                    <p>Sure, the hardest part was managing state across the different payment integrations without causing
                      the whole page to re-render.</p>
                  </div>
                  <div className="iv-q">
                    <span className="iv-tag">ISHITA</span>
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

                {/*  Frame 5: report  */}
                <div className="frame frame-5" data-frame="4">
                  <div className="f-head"><span>app.sreevaai.com/admin/candidates</span></div>
                  <div className="rp-top rp-top-link" id="reportSigninCta">
                    <div>
                      <div className="rp-id">Rahul Sharma · Senior Backend Engineer</div>
                      <div className="rp-role" style={{ "display": "flex", "gap": "8px", "marginTop": "4px" }}>
                        <span
                          style={{ "fontFamily": "var(--mono)", "fontSize": "10px", "color": "var(--muted)", "letterSpacing": ".08em" }}>COMBINED
                          SCORE</span>
                        <span style={{ "fontFamily": "var(--mono)", "fontSize": "10px", "color": "var(--primary)", "fontWeight": "600" }}>88 /
                          100</span>
                      </div>
                    </div>
                    <span className="rp-badge">Strong hire</span>
                  </div>
                  <div className="rp-score">
                    <div className="rp-num serif">88</div>
                    <div className="rp-bars">
                      <div><span>Technical depth</span><i><b style={{ "--w": "91%" }}></b></i><em>91</em></div>
                      <div><span>Problem solving</span><i><b style={{ "--w": "86%" }}></b></i><em>86</em></div>
                      <div><span>Communication</span><i><b style={{ "--w": "84%" }}></b></i><em>84</em></div>
                      <div><span>Integrity</span><i><b style={{ "--w": "100%" }}></b></i><em>100</em></div>
                    </div>
                  </div>
                  <div
                    style={{ "padding": "16px", "display": "flex", "flexDirection": "column", "gap": "12px", "background": "rgba(0,0,0,0.02)", "borderTop": "1px solid rgba(0,0,0,0.05)" }}>
                    <div>
                      <div
                        style={{ "fontSize": "11px", "fontWeight": "700", "color": "#27c93f", "textTransform": "uppercase", "letterSpacing": "0.5px", "marginBottom": "6px", "display": "flex", "alignItems": "center", "gap": "6px" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                          strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Strengths
                      </div>
                      <div style={{ "fontSize": "12px", "color": "var(--ink)", "lineHeight": "1.5", "paddingLeft": "20px" }}>
                        • Deep understanding of distributed systems architecture.<br />
                        • Strong, proactive problem solving and debugging skills.
                      </div>
                    </div>
                    <div style={{ "height": "1px", "background": "rgba(0,0,0,0.04)", "margin": "2px 0" }}></div>
                    <div>
                      <div
                        style={{ "fontSize": "11px", "fontWeight": "700", "color": "#ff5f56", "textTransform": "uppercase", "letterSpacing": "0.5px", "marginBottom": "6px", "display": "flex", "alignItems": "center", "gap": "6px" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                          strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                        Weaknesses
                      </div>
                      <div style={{ "fontSize": "12px", "color": "var(--ink)", "lineHeight": "1.5", "paddingLeft": "20px" }}>
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



        {/*  ========== COMPARISON ==========  */}
        <section className="compare" id="compare" data-section-anchor="compare">
          <div className="shell">
            <div className="sec-head" style={{ "textAlign": "center", "margin": "0 auto 64px" }}>
              <h2 className="display-h2" data-words data-reveal>
                What changes when<br /><span className="ital" style={{ "color": "var(--primary)" }}>Ishita runs the screen.</span>
              </h2>
              <p className="lede" data-reveal data-delay="2" style={{ "marginLeft": "auto", "marginRight": "auto" }}>
                Most tools record the interview. Sreeva <span className="serif-i" style={{ "color": "var(--ink)" }}>conducts</span> it,
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
                <div className="cmp-s"><span className="tick"></span>Zero. Ishita runs every screen end to end</div>
              </div>
              <div className="cmp-row">
                <div className="cmp-a">Consistency</div>
                <div className="cmp-t"><span className="cross"></span>Varies by who's interviewing and how tired they are</div>
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

        {/*  ========== TESTIMONIAL — add real customer quote here when available ==========  */}

        {/*  Pricing section removed  */}

        {/*  ========== ROI CALCULATOR ==========  */}
        <RoiCalculator />

        {/*  ========== FAQ ==========  */}
        <section className="faq" id="faq" data-section-anchor="faq" aria-label="Frequently asked questions about Sreeva AI"
          itemScope itemType="https://schema.org/FAQPage">
          <div className="shell faq-shell">
            <div className="faq-l">
              <h2 className="display-h2" data-words data-reveal>
                Frequently<br />asked <span className="ital" style={{ "color": "var(--primary)" }}>questions.</span>
              </h2>
              <p className="lede" data-reveal data-delay="2">Can't find an answer? <a href="mailto:support@sreevaai.com"
                className="link-u">support@sreevaai.com</a></p>
            </div>
            <div className="faq-r" id="faqWrap">

              <div className="faq-item" data-reveal itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                <button className="faq-q" aria-expanded="false">
                  <span className="qn"><span className="n">01</span><span className="qt" itemProp="name">Is this a real conversation or
                    pre-recorded questions?</span></span>
                  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div className="faq-a" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <div className="faq-a-inner" itemProp="text">It's a live voice call. Ishita, Sreeva's AI interviewer, joins
                    the call and conducts the interview in real time. Every question is generated from what the candidate
                    just said. There are no scripts, no fixed question banks, no branching logic. The conversation is
                    genuinely different for every candidate.</div>
                </div>
              </div>

              <div className="faq-item" data-reveal itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                <button className="faq-q" aria-expanded="false">
                  <span className="qn"><span className="n">02</span><span className="qt" itemProp="name">Does the AI make the hiring
                    decision, or do we?</span></span>
                  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div className="faq-a" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <div className="faq-a-inner" itemProp="text">You do. Sreeva gives you a structured recommendation backed by
                    evidence from the transcript, not a pass/fail verdict. Your team makes the final call. The report is
                    designed to make that decision faster and more defensible, not to replace it.</div>
                </div>
              </div>

              <div className="faq-item" data-reveal itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                <button className="faq-q" aria-expanded="false">
                  <span className="qn"><span className="n">03</span><span className="qt" itemProp="name">Is every candidate scored the
                    same way, or can the AI be inconsistent or biased?</span></span>
                  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div className="faq-a" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <div className="faq-a-inner" itemProp="text">Every candidate is scored against the same rubric: clarity,
                    depth, specificity, and grounding, applied through the same evaluation process regardless of who they
                    are. The rubric adjusts for experience level (a fresher and a senior engineer aren't held to identical
                    bars) but never for anything else. Unlike a panel of human interviewers, Ishita doesn't get tired,
                    distracted, or friendlier by the fifth call of the day.</div>
                </div>
              </div>

              <div className="faq-item" data-reveal itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                <button className="faq-q" aria-expanded="false">
                  <span className="qn"><span className="n">04</span><span className="qt" itemProp="name">What happens if the call drops
                    or a candidate has technical issues?</span></span>
                  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div className="faq-a" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <div className="faq-a-inner" itemProp="text">The call auto-reconnects on brief network drops, and a hardware
                    check runs before the interview starts to catch camera/mic issues early. If a candidate's connection
                    fails badly enough that the interview can't be completed, you can reschedule them for a fresh session
                    from your dashboard, no reset process, no lost report for the parts that did complete.</div>
                </div>
              </div>

              <div className="faq-item" data-reveal itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                <button className="faq-q" aria-expanded="false">
                  <span className="qn"><span className="n">05</span><span className="qt" itemProp="name">How does it catch cheating or
                    impersonation?</span></span>
                  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div className="faq-a" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <div className="faq-a-inner" itemProp="text">Sreeva monitors 12 behavioral and technical signals throughout
                    the call, including attention patterns, audio anomalies, and response cadence shifts, combined into a
                    single integrity score. Beyond signals, the adaptive follow-ups themselves expose candidates who can't
                    defend what they claimed: there's no way to script your way through a depth probe.</div>
                </div>
              </div>

              <div className="faq-item" data-reveal itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                <button className="faq-q" aria-expanded="false">
                  <span className="qn"><span className="n">06</span><span className="qt" itemProp="name">What does the report actually
                    contain?</span></span>
                  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div className="faq-a" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <div className="faq-a-inner" itemProp="text">A combined score (0-100), per-skill breakdown with individual
                    scores, a Hire / Hold / Reject recommendation with reasoning, verbatim evidence quotes pulled directly
                    from the transcript with timestamps, behavioral analysis, and an integrity score. Everything your panel
                    needs to make a decision, without sitting in a call.</div>
                </div>
              </div>

              <div className="faq-item" data-reveal itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                <button className="faq-q" aria-expanded="false">
                  <span className="qn"><span className="n">07</span><span className="qt" itemProp="name">What happens to interview
                    recordings, and who can access them?</span></span>
                  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div className="faq-a" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <div className="faq-a-inner" itemProp="text">Recordings are stored securely and only your organization's
                    team can access them. Retention length is configurable by your admin (a fixed number of days after
                    the interview), after which recordings are deleted automatically. Candidates are shown a clear consent
                    screen before the interview starts, disclosing that the session is recorded, and must agree before
                    the call begins.</div>
                </div>
              </div>

              <div className="faq-item" data-reveal itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                <button className="faq-q" aria-expanded="false">
                  <span className="qn"><span className="n">08</span><span className="qt" itemProp="name">How is this priced, is there
                    a free trial?</span></span>
                  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div className="faq-a" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <div className="faq-a-inner" itemProp="text">Sreeva runs on a credit-based plan sized to your hiring
                    volume, not a flat per-seat subscription. There's no self-serve signup: book a demo and we'll size a
                    plan around how many roles and candidates you're actually screening, and you can see the product on
                    a real role from your pipeline before committing.</div>
                </div>
              </div>

              <div className="faq-item" data-reveal itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                <button className="faq-q" aria-expanded="false">
                  <span className="qn"><span className="n">09</span><span className="qt" itemProp="name">Does this replace our
                    final-round interviews?</span></span>
                  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div className="faq-a" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <div className="faq-a-inner" itemProp="text">No. Sreeva handles the first-round technical screen, the
                    call that usually costs a senior engineer 60-90 minutes per candidate. It filters out candidates who
                    can't back up their resume, so your team's final-round time goes to candidates who are actually worth
                    a deeper conversation.</div>
                </div>
              </div>

              <div className="faq-item" data-reveal itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                <button className="faq-q" aria-expanded="false">
                  <span className="qn"><span className="n">10</span><span className="qt" itemProp="name">How long does it take to set
                    up a role, and how do candidates join?</span></span>
                  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div className="faq-a" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <div className="faq-a-inner" itemProp="text">Under 5 minutes on your end: upload the JD, review the
                    extracted skills, invite candidates. The first interview can go out the same day. Candidates get a
                    link by email, pick a slot that works for them, and join from their browser. No app to download, no
                    account to create.</div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/*  ========== CTA ==========  */}
        <section className="cta" id="contact" data-section-anchor="contact">
          <div className="shell">
            <div className="cta-card" data-reveal>
              <div className="cta-grid-bg" aria-hidden="true"></div>
              <div className="cta-inner">
                <h2 className="cta-h">See exactly what your<br />candidates <span className="ital"
                  style={{ "color": "var(--primary)" }}>actually know.</span></h2>
                <p className="cta-p">Book a 30-minute walkthrough. We'll run Ishita on a real role from your pipeline. You'll
                  see the interview, the probes, and the report. Live.</p>
                <div className="cta-buttons" style={{ "margin": "0 auto", "justifyContent": "center" }}>
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
      </main>

      {/*  ========== FOOTER ==========  */}
      <footer className="ft" aria-label="Site footer" id="footer">
        <div className="shell">
          <div className="ft-grid">
            <div className="ft-col">
              <a className="brand" href="#top" data-scroll="top">
                <img src="/sreevaai-logo.png" alt="Sreeva AI" width="32" height="32" loading="lazy" />
                <span className="brand-name"><span className="brand-s">Sreeva</span><span className="brand-ai">AI</span></span>
              </a>
              <p className="ft-blurb">Adaptive AI that conducts first-round interviews, probes every claim, and hands you a
                hiring decision in 20 minutes.</p>
              <div className="ft-social">
                <a href="https://www.linkedin.com/company/sreeva-ai/about/" target="_blank" rel="noopener noreferrer"
                  aria-label="LinkedIn"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                    <path
                      d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.119 20.452H3.555V9h3.564v11.452z" />
                  </svg></a>
                <a href="mailto:support@sreevaai.com" aria-label="Email"><svg viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 6-10 7L2 6" />
                </svg></a>
              </div>
            </div>
            <div className="ft-col">
              <h5>Product</h5>
              <ul>
                <li><a href="#platform" data-scroll="platform">Platform</a></li>
                <li><a href="#how" data-scroll="how">How it works</a></li>
                <li><a href="#roi" data-scroll="roi">ROI Calculator</a></li>
                <li><a href="#faq" data-scroll="faq">FAQ</a></li>
              </ul>
            </div>
            <div className="ft-col">
              <h5>Contact</h5>
              <address style={{ "fontStyle": "normal" }}>
                <ul>
                  <li><a href="mailto:support@sreevaai.com" rel="noopener noreferrer">support@sreevaai.com</a></li>
                  <li><a href="tel:+918919053970">+91 8919053970</a></li>
                  <li><a href="https://cal.com/vamsivk/30min" target="_blank" rel="noopener noreferrer">Book a demo</a></li>
                </ul>
              </address>
            </div>
            <div className="ft-col">
              <h5>Legal</h5>
              <ul>
                <li><a href="/privacy">Privacy policy</a></li>
                <li><a href="/terms">Terms of service</a></li>
              </ul>
            </div>
          </div>

          <div className="ft-bottom">
            <p>© 2026 Sreeva AI. All rights reserved.</p>
          </div>
        </div>
      </footer>




      <Script src="/app.js" strategy="lazyOnload" />
    </>
  );
}
