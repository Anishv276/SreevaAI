/* =========================================================
   Sreeva AI — interactions
   ========================================================= */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCoarse = matchMedia('(hover: none), (pointer: coarse)').matches;

  /* -----------------------------------------------------
     Smooth scroll without hash in URL
     Intercepts all [data-scroll] links and scrolls to the
     target section via scrollIntoView, then wipes the hash
     from the address bar using history.replaceState so the
     URL stays clean (no /#platform appended).
  ----------------------------------------------------- */
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-scroll]');
    if (!link) return;
    const target = link.dataset.scroll;
    const el = target === 'top' ? document.body : document.getElementById(target);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    // Remove hash from URL without triggering a navigation
    history.replaceState(null, '', window.location.pathname);
  });

  /* -----------------------------------------------------
     Magnetic buttons
  ----------------------------------------------------- */
  if (!isCoarse && !reduce) {
    document.querySelectorAll('[data-magnet]').forEach((el) => {
      const strength = 0.25;
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) * strength;
        const dy = (e.clientY - (r.top + r.height / 2)) * strength;
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = '';
      });
    });
  }

  /* -----------------------------------------------------
     Scroll progress
  ----------------------------------------------------- */
  const prog = document.getElementById('scrollProg');
  const onScroll = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    if (prog) prog.style.width = (max > 0 ? (h.scrollTop || window.scrollY) / max * 100 : 0) + '%';

    const nav = document.getElementById('nav');
    if (nav) nav.classList.toggle('scrolled', (window.scrollY || 0) > 8);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* -----------------------------------------------------
     Per-word headline reveal
  ----------------------------------------------------- */
  function splitWords(el, counter) {
    const nodes = [...el.childNodes];
    for (const node of nodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (!text.trim()) continue;
        const frag = document.createDocumentFragment();
        const parts = text.split(/(\s+)/);
        for (const part of parts) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.appendChild(document.createTextNode(part));
          } else {
            const wrap = document.createElement('span');
            wrap.className = 'rw';
            const inner = document.createElement('span');
            inner.textContent = part;
            inner.style.transitionDelay = (counter.n * 0.055) + 's';
            counter.n += 1;
            wrap.appendChild(inner);
            frag.appendChild(wrap);
          }
        }
        node.replaceWith(frag);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'BR') continue;
        // Also process existing inline spans (like .ital, .rfx)
        if (node.classList && (node.classList.contains('rw'))) continue;
        // If a span already exists from raw HTML, just wrap it
        if (node.tagName === 'SPAN' && !node.classList.contains('rw')) {
          const wrap = document.createElement('span');
          wrap.className = 'rw';
          const clone = node.cloneNode(true);
          clone.style.display = 'inline-block';
          clone.style.transform = 'translateY(115%)';
          clone.style.opacity = '0';
          clone.style.transition = 'transform .9s cubic-bezier(.16,1,.3,1), opacity .9s cubic-bezier(.16,1,.3,1)';
          clone.style.transitionDelay = (counter.n * 0.055) + 's';
          counter.n += 1;
          wrap.appendChild(clone);
          node.replaceWith(wrap);
        } else {
          splitWords(node, counter);
        }
      }
    }
  }
  document.querySelectorAll('[data-words]').forEach((el) => {
    splitWords(el, { n: 0 });
    // Once visible, reset child <span> styles to "in" state
    el.addEventListener('transitionstart', () => {}, { once: true });
  });

  /* -----------------------------------------------------
     Reveal on scroll
  ----------------------------------------------------- */
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        // When data-words container becomes visible, drive its inline-styled spans too
        if (e.target.hasAttribute('data-words')) {
          e.target.querySelectorAll('.rw > span').forEach((s) => {
            s.style.transform = 'translateY(0)';
            s.style.opacity = '1';
          });
        }
        revealIO.unobserve(e.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

  document.querySelectorAll('[data-reveal], [data-words], .report, .bx-cost').forEach((el) => {
    // ponytail: immediately reveal elements already in the viewport on load
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) {
      el.classList.add('is-visible');
      if (el.hasAttribute('data-words')) {
        el.querySelectorAll('.rw > span').forEach((s) => { s.style.transform = 'translateY(0)'; s.style.opacity = '1'; });
      }
    } else {
      revealIO.observe(el);
    }
  });

  /* -----------------------------------------------------
     Number counters
  ----------------------------------------------------- */
  const countIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const target = parseFloat(el.dataset.count);
      const suffix = el.dataset.suffix || '';
      const dur = 1400;
      const start = performance.now();
      const fmt = (v) => Math.round(v).toLocaleString();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = fmt(target * eased) + suffix;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      countIO.unobserve(el);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-count]').forEach((el) => countIO.observe(el));

  /* -----------------------------------------------------
     Nav active section — pick the section currently
     dominating the viewport
  ----------------------------------------------------- */
  const navLinks = document.querySelectorAll('#navLinks a');
  const sections = [...document.querySelectorAll('[data-section-anchor]')]
    .filter(s => s.id && [...navLinks].some(l => l.dataset.section === s.getAttribute('data-section-anchor')));

  function syncNavActive() {
    const probe = window.innerHeight * 0.32; // ~1/3 down the viewport
    let current = null;
    for (const s of sections) {
      const r = s.getBoundingClientRect();
      if (r.top <= probe && r.bottom >= probe) { current = s; break; }
      if (r.top > probe) break;
      current = s;
    }
    const id = current ? current.getAttribute('data-section-anchor') : null;
    navLinks.forEach((l) => l.classList.toggle('active', !!id && l.dataset.section === id));
  }
  window.addEventListener('scroll', syncNavActive, { passive: true });
  window.addEventListener('resize', syncNavActive);
  syncNavActive();

  /* -----------------------------------------------------
     Hero blob parallax
  ----------------------------------------------------- */
  const blob = document.getElementById('heroBlob');
  if (blob && !isCoarse && !reduce) {
    document.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 60;
      const y = (e.clientY / window.innerHeight - 0.5) * 60;
      blob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    });
  }

  /* -----------------------------------------------------
     3D tilt on bento + soft spotlight
  ----------------------------------------------------- */
  if (!isCoarse && !reduce) {
    document.querySelectorAll('.tilt').forEach((el) => {
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        const rx = (py - 0.5) * -4;
        const ry = (px - 0.5) * 4;
        el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
        el.style.setProperty('--mx', (px * 100) + '%');
        el.style.setProperty('--my', (py * 100) + '%');
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = '';
      });
    });
  }

  /* -----------------------------------------------------
     Sign-in routing for the workflow report preview
     - Not signed in → "/signin"  (default href in HTML)
     - Signed in     → SIGNED_IN_HREF below
     Replace the auth check (isSignedIn) with your real one
  ----------------------------------------------------- */
  const SIGNED_IN_HREF = '/dashboard'; // ← change to your post-login page
  const signinCta = document.getElementById('reportSigninCta');
  if (signinCta) {
    signinCta.addEventListener('click', (e) => {
      // TODO: replace with your real auth check
      const isSignedIn = !!(window.localStorage && localStorage.getItem('sreeva_token'));
      if (isSignedIn) {
        e.preventDefault();
        window.location.href = SIGNED_IN_HREF;
      }
    });
  }

  /* -----------------------------------------------------
     Report score subtle counter on reveal
  ----------------------------------------------------- */
  const repScore = document.getElementById('repScore');
  const reportCard = document.getElementById('reportCard');
  if (repScore && reportCard) {
    const ro = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const target = 94;
        const dur = 1400;
        const start = performance.now();
        const tick = (now) => {
          const t = Math.min(1, (now - start) / dur);
          const eased = 1 - Math.pow(1 - t, 3);
          repScore.textContent = Math.round(target * eased);
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        ro.unobserve(e.target);
      });
    }, { threshold: 0.4 });
    ro.observe(reportCard);
  }

  /* -----------------------------------------------------
     "How it works" — scroll-pinned step tracker
  ----------------------------------------------------- */
  const railFill = document.getElementById('railFill');
  const stage = document.getElementById('howStage');
  const railRoot = document.querySelector('.how');
  if (railFill && stage && railRoot) {
    const frames = [...stage.querySelectorAll('.frame')];
    const steps = [...document.querySelectorAll('.rs')];

    function setActive(idx) {
      frames.forEach((f, i) => f.classList.toggle('is-on', i === idx));
      steps.forEach((s, i) => s.classList.toggle('active', i === idx));
      const counter = document.getElementById('stageCount');
      if (counter) counter.textContent = String(idx + 1).padStart(2, '0');
    }
    setActive(0);

    const update = () => {
      const r = railRoot.getBoundingClientRect();
      const vh = window.innerHeight;
      // Progress 0..1 as the section travels through the viewport (with start offset)
      const total = r.height - vh;
      const traveled = Math.min(Math.max(-r.top, 0), total);
      const p = total > 0 ? traveled / total : 0;
      railFill.style.height = (p * 100) + '%';
      const idx = Math.min(frames.length - 1, Math.floor(p * frames.length * 0.999));
      setActive(idx);
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* -----------------------------------------------------
     FAQ — content is in static HTML for SEO crawlability.
     This block only wires up the accordion behaviour.
  ----------------------------------------------------- */
  const faqWrap = document.getElementById('faqWrap');
  if (faqWrap) {
    // Register pre-rendered items with the reveal observer
    faqWrap.querySelectorAll('.faq-item').forEach((item) => revealIO.observe(item));

    faqWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.faq-q');
      if (!btn) return;
      const item = btn.closest('.faq-item');
      const ans = item.querySelector('.faq-a');
      const open = item.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
      if (open) {
        ans.style.maxHeight = ans.scrollHeight + 'px';
        // Close siblings
        item.parentElement.querySelectorAll('.faq-item.open').forEach((sib) => {
          if (sib !== item) {
            sib.classList.remove('open');
            sib.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
            sib.querySelector('.faq-a').style.maxHeight = '0px';
          }
        });
      } else {
        ans.style.maxHeight = '0px';
      }
    });
  }

  /* -----------------------------------------------------
     Detail comparison table (pricing)
     Content is now in static HTML for SEO crawlability.
     No JS injection needed.
  ----------------------------------------------------- */

})();
