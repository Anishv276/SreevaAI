"use client";

import { useEffect } from "react";

const HERO_CONVERSATION = [
  { role: "CANDIDATE", colorClass: "candidate", text: "\"We rebuilt our checkout flow. Reduced drop-off by around 30%.\"" },
  { role: "ISHITHA · ADAPTING", colorClass: "ishita", text: "\"What was specifically yours in that rebuild? What would not have shipped without you? Walk me through the hardest state problem you hit.\"" },
  { role: "CANDIDATE", colorClass: "candidate", text: "\"I owned the cart state machine. We had race conditions when users edited quantity while a payment was in flight.\"" },
  { role: "ISHITHA · ADAPTING", colorClass: "ishita", text: "\"How did you detect that race condition in the first place, and what did the fix actually change?\"" },
  { role: "CANDIDATE", colorClass: "candidate", text: "\"Support tickets showed duplicate charges. I added an idempotency key and locked cart writes during checkout.\"" },
  { role: "ISHITHA · ADAPTING", colorClass: "ishita", text: "\"If that lock failed under load, what would a user actually see?\"" },
];

export default function HeroSection() {
  useEffect(() => {
    const chatBody: HTMLElement | null = document.getElementById("chat-stream-body");
    if (!chatBody) return;
    chatBody.innerHTML = "";

    let cancelled = false;

    function autoScroll() {
      if (!chatBody) return;
      const nearBottom = chatBody.scrollHeight - chatBody.scrollTop - chatBody.clientHeight < 80;
      if (nearBottom) chatBody.scrollTop = chatBody.scrollHeight;
    }

    let msgIndex = 0;

    function typeText(element: HTMLElement, text: string, speed: number, onComplete?: () => void) {
      let charIndex = 0;
      element.innerHTML = '<span class="text-content"></span><span class="type-cursor"></span>';
      const textSpan = element.querySelector(".text-content") as HTMLElement;
      const cursor = element.querySelector(".type-cursor") as HTMLElement;

      const interval = setInterval(() => {
        if (cancelled) { clearInterval(interval); return; }
        if (charIndex < text.length) {
          textSpan.textContent += text.charAt(charIndex);
          charIndex++;
          autoScroll();
        } else {
          clearInterval(interval);
          cursor.style.display = "none";
          if (onComplete) setTimeout(onComplete, 500);
        }
      }, speed);
    }

    function playStream() {
      if (cancelled) return;
      if (msgIndex >= HERO_CONVERSATION.length) {
        setTimeout(() => {
          if (cancelled || !chatBody) return;
          chatBody.innerHTML = "";
          msgIndex = 0;
          playStream();
        }, 5000);
        return;
      }

      const msg = HERO_CONVERSATION[msgIndex];

      const bubble = document.createElement("div");
      bubble.className = "chat-bubble visible";

      const header = document.createElement("div");
      header.className = `chat-header ${msg.colorClass}`;

      const iconHTML = msg.colorClass === "ishita"
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

      header.innerHTML = `${iconHTML} <span>${msg.role}</span>`;

      const content = document.createElement("div");
      content.className = "chat-content";

      bubble.appendChild(header);
      bubble.appendChild(content);
      chatBody?.appendChild(bubble);
      autoScroll();

      const speed = msg.colorClass === "ishita" ? 25 : 35;

      typeText(content, msg.text, speed, () => {
        msgIndex++;
        autoScroll();
        playStream();
      });
    }

    const startTimer = setTimeout(playStream, 800);

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
    };
  }, []);

  return (
    <section className="hero-glossy" data-section-anchor="hero">
      <div className="hero-split">
        <div className="hero-left">
          <h1 className="headline">Meet Ishitha
            <span className="role-rotator" id="roleRotator">
              <span className="role-rotator-track" id="roleRotatorTrack">
                <span className="ital" style={{ color: "var(--primary)" }}>Adaptive AI Interviewer</span>
                <span className="ital" style={{ color: "var(--primary)" }}>First-Round Interviewer</span>
                <span className="ital" style={{ color: "var(--primary)" }}>AI Interviewer for Engineering Teams</span>
              </span>
            </span>
          </h1>
          <p className="body-text">Ishitha runs first-round technical interviews for engineering roles, adapts to
            what candidates actually say, and hands you a decision-ready report in 20 minutes.</p>

          <div className="cta-container">
            <a href="https://cal.com/vamsivk/30min" className="btn-primary-lg">Book a Demo</a>
            <a
              href="/demo"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary-lg"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "14px 28px",
                borderRadius: "12px",
                fontSize: "1rem",
                fontWeight: 600,
                fontFamily: "var(--sans)",
                letterSpacing: "-0.01em",
                textDecoration: "none",
                border: "1.5px solid rgba(124,58,237,0.35)",
                background: "rgba(124,58,237,0.06)",
                color: "var(--primary)",
                transition: "all 0.2s ease",
                cursor: "pointer",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(124,58,237,0.12)";
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(124,58,237,0.6)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(124,58,237,0.06)";
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(124,58,237,0.35)";
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#27c93f", display: "inline-block", boxShadow: "0 0 6px #27c93f" }} />
              Try Demo
            </a>
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
              <div className="window-body" id="chat-stream-body"></div>
              <div className="ui-footer" style={{ padding: "12px 24px" }}>
                <span style={{ fontSize: "0.875rem", color: "rgba(255, 255, 255, 0.6)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ width: "8px", height: "8px", background: "#27c93f", borderRadius: "50%", display: "inline-block", boxShadow: "0 0 8px #27c93f" }}></span>
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

      <div className="shell" style={{ marginTop: "80px", position: "relative", zIndex: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "48px", alignItems: "center" }}>
          <div style={{ flex: "1", minWidth: "320px" }}>
            <h3 style={{ fontFamily: "var(--sans)", fontSize: "clamp(2rem, 3vw, 2.5rem)", margin: "16px 0 20px", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              See Sreeva in action.</h3>
            <p style={{ fontSize: "1.125rem", color: "var(--muted)", lineHeight: 1.6 }}>Upload your Job Description, drop in
              your candidates, and let Sreeva handle the rest. Launching a fully autonomous screening campaign takes
              less than a minute.</p>
          </div>
          <div style={{ flex: "1.5", minWidth: "320px" }}>
            <div className="hero-video-wrapper"
              style={{ borderRadius: "24px", overflow: "hidden", boxShadow: "0 20px 40px rgba(0,0,0,0.08)", border: "1px solid rgba(255,255,255,0.6)" }}>
              <video width="100%" autoPlay loop muted playsInline style={{ display: "block" }}>
                <source src="/sreeva-vid.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
