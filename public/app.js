/* =========================================================
   Sreeva AI — interactions
   ========================================================= */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCoarse = matchMedia('(hover: none), (pointer: coarse)').matches;

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

  document.querySelectorAll('[data-reveal], [data-words], .report, .bx-cost').forEach((el) => revealIO.observe(el));

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
     FAQ
  ----------------------------------------------------- */
  const faqs = [
    { q: "What is Sreeva AI?", a: "An AI interviewer that conducts first-round interviews automatically — it reads the resume, asks role-relevant questions, adapts based on answers, and hands you a hiring recommendation with evidence." },
    { q: "Is it really AI or just pre-recorded questions?", a: "It's a live AI conversation. Questions change based on what the candidate says. No scripts, no fixed flow." },
    { q: "Can I customize the interview for my role?", a: "Yes. Every interview is built from your JD. You can also add specific questions you want asked." },
    { q: "How does it detect cheating?", a: "Sreeva monitors 12+ behavioural signals — not just tab switching. The adaptive follow-ups themselves expose candidates who can't back up their answers." },
    { q: "Will candidates be comfortable with an AI interview?", a: "Most prefer it. No scheduling pressure, no judgment, interview on their own time and timezone." },
    { q: "Does the AI make the final hiring decision?", a: "No. Sreeva gives you a structured recommendation with evidence. Your team makes the final call." },
    { q: "How long does setup take?", a: "Under ten minutes. Upload your JD, invite candidates, done." },
    { q: "What about data privacy and compliance?", a: "GDPR and India DPDP ready. SOC 2 in flight. Recordings are encrypted at rest and retention is configurable per plan." },
  ];
  const faqWrap = document.getElementById('faqWrap');
  if (faqWrap) {
    faqs.forEach((f, i) => {
      const item = document.createElement('div');
      item.className = 'faq-item';
      item.setAttribute('data-reveal', '');
      item.innerHTML = `
        <button class="faq-q" aria-expanded="false">
          <span class="qn"><span class="n">${String(i+1).padStart(2,'0')}</span><span class="qt">${f.q}</span></span>
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="faq-a"><div class="faq-a-inner">${f.a}</div></div>
      `;
      faqWrap.appendChild(item);
      revealIO.observe(item);
    });
    faqWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.faq-q');
      if (!btn) return;
      const item = btn.closest('.faq-item');
      const ans = item.querySelector('.faq-a');
      const open = item.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
      if (open) {
        ans.style.maxHeight = ans.scrollHeight + 'px';
        // Close siblings (optional)
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
  ----------------------------------------------------- */
  const featureComparison = [
    ["Active Jobs",                 "1",       "5",        "10+",       "Unlimited"],
    ["Interviewer Voices",          "3",       "10+",      "20+",       "Unlimited"],
    ["Ask Sreeva AI",               "—",       "Yes",      "Yes",       "Yes"],
    ["Adaptive AI Interview",       "Yes",     "Yes",      "Yes",       "Yes"],
    ["Resume + JD Based Questions", "Yes",     "Yes",      "Yes",       "Yes"],
    ["Smart Follow-ups",            "Yes",     "Yes",      "Yes",       "Yes"],
    ["AI Interview Report",         "Yes",     "Yes",      "Yes",       "Yes"],
    ["Pre-qualifying Questions",    "Yes",     "Yes",      "Yes",       "Yes"],
    ["AI Proctoring",               "—",       "Basic",    "Advanced",  "Advanced"],
    ["Multilingual",                "—",       "Yes",      "Yes",       "Yes"],
    ["Recording Storage",           "7 days",  "14 days",  "30 days",   "Custom"],
    ["Support",                     "Email",   "Priority", "Priority",  "Dedicated"],
  ];
  const detailBody = document.getElementById('detailBody');
  const cellVal = (v) => v === 'Yes'
    ? `<span class="ck-i" aria-label="Yes"></span>`
    : v === '—' ? `<span class="dash">—</span>` : v;
  if (detailBody) {
    featureComparison.forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="feat">${row[0]}</td>
        <td class="c">${cellVal(row[1])}</td>
        <td class="c hl">${cellVal(row[2])}</td>
        <td class="c">${cellVal(row[3])}</td>
        <td class="c">${cellVal(row[4])}</td>
      `;
      detailBody.appendChild(tr);
    });
  }

})();
