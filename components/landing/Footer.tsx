export default function Footer() {
  return (
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
            <address style={{ fontStyle: "normal" }}>
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
  );
}
