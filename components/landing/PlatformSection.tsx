"use client";

import { useEffect } from "react";

const PLATFORM_CONVERSATION = [
  { kind: "message", role: "SREEVA · ADAPTING", colorClass: "ishita", text: "\"What happens if the event fails to fire or gets lost? How do you ensure the cache eventually matches the DB?\"" },
  { kind: "signal", label: "Question asked" },
  { kind: "message", role: "CANDIDATE", colorClass: "candidate", text: "\"We built a background reconciliation worker that scans the outbox table and retries unacknowledged events.\"" },
  { kind: "signal", label: "Signal detected: systems thinking" },
  { kind: "message", role: "SREEVA · ADAPTING", colorClass: "ishita", text: "\"What happens if two reconciliation runs fire at the same time for the same record?\"" },
  { kind: "signal", label: "Question asked" },
  { kind: "signal", label: "Follow-up adapted" },
];

export default function PlatformSection() {
  useEffect(() => {
    const pChatBody: HTMLElement | null = document.getElementById("platform-chat-stream-body");
    if (!pChatBody) return;

    let pCancelled = false;

    function pAutoScroll() {
      if (!pChatBody) return;
      const nearBottom = pChatBody.scrollHeight - pChatBody.scrollTop - pChatBody.clientHeight < 80;
      if (nearBottom) pChatBody.scrollTop = pChatBody.scrollHeight;
    }

    let pMsgIndex = 0;

    function typeTextPlatform(element: HTMLElement, text: string, speed: number, onComplete?: () => void) {
      let charIndex = 0;
      element.innerHTML = '<span class="text-content"></span><span class="type-cursor"></span>';
      const textSpan = element.querySelector(".text-content") as HTMLElement;
      const cursor = element.querySelector(".type-cursor") as HTMLElement;

      const interval = setInterval(() => {
        if (pCancelled) { clearInterval(interval); return; }
        if (charIndex < text.length) {
          textSpan.textContent += text.charAt(charIndex);
          charIndex++;
          pAutoScroll();
        } else {
          clearInterval(interval);
          cursor.style.display = "none";
          if (onComplete) setTimeout(onComplete, 300);
        }
      }, speed);
    }

    function renderSignalChip(label: string) {
      const chip = document.createElement("div");
      chip.className = "signal-chip";
      chip.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#27c93f" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            <span>${label}</span>
          `;
      pChatBody?.appendChild(chip);
      pAutoScroll();
      requestAnimationFrame(() => chip.classList.add("visible"));
    }

    function playPlatformStream() {
      if (pCancelled) return;
      if (pMsgIndex >= PLATFORM_CONVERSATION.length) {
        setTimeout(() => {
          if (pCancelled || !pChatBody) return;
          pChatBody.innerHTML = "";
          pMsgIndex = 0;
          playPlatformStream();
        }, 4000);
        return;
      }

      const step = PLATFORM_CONVERSATION[pMsgIndex];

      if (step.kind === "signal") {
        renderSignalChip((step as { label: string }).label);
        pMsgIndex++;
        setTimeout(playPlatformStream, 700);
        return;
      }

      const msg = step as { role: string; colorClass: string; text: string };

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
      pChatBody?.appendChild(bubble);
      pAutoScroll();

      const speed = msg.colorClass === "ishita" ? 25 : 35;

      typeTextPlatform(content, msg.text, speed, () => {
        pMsgIndex++;
        pAutoScroll();
        playPlatformStream();
      });
    }

    const platformSection = document.getElementById("platform");
    let pObserver: IntersectionObserver | undefined;
    if (platformSection) {
      const observer: IntersectionObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          setTimeout(playPlatformStream, 600);
          observer.disconnect();
        }
      }, { threshold: 0.3 });
      observer.observe(platformSection);
      pObserver = observer;
    }

    return () => {
      pCancelled = true;
      if (pObserver) pObserver.disconnect();
    };
  }, []);

  return (
    <section className="platform" id="platform" data-section-anchor="platform"
      aria-label="Sreeva AI platform features">
      <div className="shell">
        <div className="hero-split" style={{ gap: "40px", alignItems: "stretch" }}>
          <div className="hero-left" style={{ justifyContent: "center", maxWidth: "520px", paddingRight: "20px" }}>
            <div className="sec-head" style={{ marginBottom: "32px" }}>
              <h2 className="display-h2" data-words data-reveal
                style={{ fontSize: "clamp(2rem, 2.8vw, 2.8rem)", marginTop: "0", lineHeight: "1.25" }}>
                <span style={{ color: "var(--primary)" }}>She listens.</span><br />
                <span style={{ color: "var(--primary)" }}>She follows up.</span><br />
                No script.<br />
                No template.
              </h2>
              <p className="lede" data-reveal data-delay="2" style={{ fontSize: "1.05rem" }}>
                Ishitha isn&apos;t running through a checklist. She hears what the candidate says and decides what to ask
                next. If they claim strong system design work, she asks about a specific failure. If they pivot away
                from a question, she comes back. It is the interview your best engineer would run, if they had 3 hours
                for every candidate.
              </p>
            </div>

            <div className="bento" style={{ gridTemplateColumns: "1fr", marginTop: "0", width: "100%" }}>
              <div className="stat-card"
                style={{ padding: "24px", textAlign: "left", display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                  <div className="stat-number"
                    style={{ fontSize: "2.5rem", color: "var(--primary)", margin: "0", minWidth: "80px" }}>100%</div>
                  <div className="stat-label" style={{ fontSize: "1rem", lineHeight: "1.4", color: "var(--ink)" }}>of
                    questions adapt to the answer</div>
                </div>
              </div>
            </div>
          </div>

          <div className="hero-right" style={{ display: "flex", alignItems: "center" }}>
            <div className="sig-container"
              style={{ background: "linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(124, 58, 237, 0.3) 100%)", width: "100%" }}>
              <div
                style={{ position: "absolute", top: "16px", left: "24px", zIndex: 10, fontFamily: "var(--sans)", fontSize: "1.1rem", fontWeight: 700, color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,0.3)" }}>
                Adaptive Probe in action</div>
              <div className="mock-window" style={{ marginTop: "36px", display: "flex", flexDirection: "column" }}>
                <div className="window-header">
                  <div className="dot dot-red"></div>
                  <div className="dot dot-yellow"></div>
                  <div className="dot dot-green"></div>
                </div>
                <div className="window-body" id="platform-chat-stream-body"
                  style={{ padding: "20px", gap: "12px", height: "320px", overflowY: "auto", scrollBehavior: "smooth" }}></div>
                <div className="ui-footer"
                  style={{ padding: "12px 24px", background: "rgba(0,0,0,0.25)", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ width: "8px", height: "8px", background: "#27c93f", borderRadius: "50%", display: "inline-block", boxShadow: "0 0 8px #27c93f" }}></span>
                  <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>Sreeva AI Engine Active</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
