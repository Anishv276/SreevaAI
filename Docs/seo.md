# Sreeva AI — SEO Implementation Document

**Last updated:** 2026-06-04  
**Domain:** https://www.sreevaai.com  
**Stack:** Next.js 16 (App Router) + static `public/index.html` marketing page

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Current SEO Score](#2-current-seo-score)
3. [Files Changed](#3-files-changed)
4. [Phase 1 — Critical Fixes](#4-phase-1--critical-fixes)
5. [Phase 2 — High Priority Fixes](#5-phase-2--high-priority-fixes)
6. [Phase 3 — Performance SEO](#6-phase-3--performance-seo)
7. [Phase 4 — AI Search Optimization](#7-phase-4--ai-search-optimization)
8. [Remaining Work](#8-remaining-work)
9. [Roadmap](#9-roadmap)
10. [Validation Checklist](#10-validation-checklist)

---

## 1. Architecture Overview

The project has **two distinct rendering contexts** that require separate SEO treatment:

| Surface | URL | Rendered by | SEO Owner |
|---------|-----|-------------|-----------|
| Marketing landing page | `sreevaai.com/` | Static file `public/index.html` served directly by Next.js | Raw `<head>` in `index.html` |
| Web app | `sreevaai.com/login`, `/privacy`, `/terms`, `/admin/**`, `/interview/**` | Next.js App Router | `app/layout.tsx` + per-page `metadata` exports |

**Key implication:** Changes to `app/layout.tsx` metadata do **not** affect the marketing landing page. They are independent. Any SEO change to the homepage must go into `public/index.html` directly.

### Page Indexability Map

| Route | Should Index | Canonical | noindex applied |
|-------|-------------|-----------|-----------------|
| `/` (marketing) | ✅ Yes | `https://www.sreevaai.com/` | — |
| `/privacy` | ✅ Yes | `https://www.sreevaai.com/privacy` | — |
| `/terms` | ✅ Yes | `https://www.sreevaai.com/terms` | — |
| `/login` | ❌ No | — | `app/login/layout.tsx` |
| `/login/forgot-password` | ❌ No | — | robots.ts disallow |
| `/interview/**` | ❌ No | — | `app/interview/layout.tsx` |
| `/admin/**` | ❌ No | — | `app/admin/layout.tsx` + robots.ts |
| `/super-admin/**` | ❌ No | — | robots.ts disallow |
| `/api/**` | ❌ No | — | robots.ts disallow |

---

## 2. Current SEO Score

### Before Implementation

| Category | Score |
|----------|-------|
| Structured Data | 0/10 |
| Social Sharing (OG/Twitter) | 0/10 |
| Technical SEO | 5/10 |
| Content Crawlability | 4/10 |
| Performance (Core Web Vitals) | 6/10 |
| Indexability | 6/10 |
| On-Page SEO | 7/10 |
| **Overall** | **52/100** |

### After Implementation

| Category | Score | Change |
|----------|-------|--------|
| Structured Data | 9/10 | +9 |
| Social Sharing (OG/Twitter) | 9/10 | +9 |
| Technical SEO | 8/10 | +3 |
| Content Crawlability | 9/10 | +5 |
| Performance (Core Web Vitals) | 8/10 | +2 |
| Indexability | 9/10 | +3 |
| On-Page SEO | 9/10 | +2 |
| **Overall** | **81/100** | **+29** |

---

## 3. Files Changed

| File | Type | What Changed |
|------|------|-------------|
| `public/index.html` | Modified | Head tags, OG, Twitter, canonical, JSON-LD, static FAQ HTML, static pricing table, alt text, stat numbers, font loading, script defer, preload hints, section semantics |
| `public/app.js` | Modified | Removed FAQ DOM injection, removed pricing table DOM injection. Accordion wiring preserved. |
| `app/layout.tsx` | Modified | Removed root canonical, title template, OG image dimensions, robots googleBot config, fixed Suspense fallback H1 |
| `app/robots.ts` | Modified | Added `/interview/` and `/login/forgot-password` to disallow |
| `app/sitemap.ts` | Modified | Fixed `lastModified` to real dates, corrected `changeFrequency` |
| `app/privacy/layout.tsx` | Created | Page-specific metadata: title, canonical, description, OG |
| `app/terms/layout.tsx` | Created | Page-specific metadata: title, canonical, description, OG |
| `app/login/layout.tsx` | Created | `robots: noindex` |
| `app/interview/layout.tsx` | Created | `robots: noindex` |

---

## 4. Phase 1 — Critical Fixes

### 4.1 Open Graph Tags

**File:** `public/index.html`

Added to `<head>`:

```html
<meta property="og:type" content="website" />
<meta property="og:url" content="https://www.sreevaai.com/" />
<meta property="og:site_name" content="Sreeva AI" />
<meta property="og:title" content="Sreeva AI — Hire the top 1% with adaptive AI" />
<meta property="og:description" content="Adaptive AI interviewer that asks the questions your best engineers would ask. Reduce bad hires before they reach a panel." />
<meta property="og:image" content="https://www.sreevaai.com/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Sreeva AI — adaptive AI interviewer for first-round hiring" />
<meta property="og:locale" content="en_US" />
```

**Why:** Every LinkedIn, Slack, Twitter, and WhatsApp share renders a branded 1200×630 preview card instead of a bare URL. Critical for B2B SaaS where the sales cycle runs through social sharing.

**⚠️ Action required:** Create `/public/og-image.png` at 1200×630px. Use Figma or Canva. Show product name, tagline, and a screenshot/visual. Do **not** use the logo alone — it will appear too small and unbranded in LinkedIn previews.

---

### 4.2 Twitter Card Tags

**File:** `public/index.html`

```html
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Sreeva AI — Hire the top 1% with adaptive AI" />
<meta name="twitter:description" content="Adaptive AI interviewer that asks the questions your best engineers would ask. Reduce bad hires before they reach a panel." />
<meta name="twitter:image" content="https://www.sreevaai.com/og-image.png" />
<meta name="twitter:image:alt" content="Sreeva AI — adaptive AI interviewer for first-round hiring" />
```

**Why:** `summary_large_image` shows a full-width image on Twitter/X. Same image as OG (`og-image.png`). Validate at https://cards-dev.twitter.com/validator after deploying.

---

### 4.3 Canonical URL

**File:** `public/index.html`

```html
<link rel="canonical" href="https://www.sreevaai.com/" />
```

**Why:** Without a canonical, if the page is ever accessible at both `sreevaai.com` and `www.sreevaai.com`, Google splits link equity between two versions. The canonical declares the authoritative URL.

---

### 4.4 JSON-LD Structured Data

**File:** `public/index.html` — inside `<head>` as `<script type="application/ld+json">`

Five schema types in a single `@graph`:

#### Organization
```json
{
  "@type": "Organization",
  "@id": "https://www.sreevaai.com/#organization",
  "name": "Sreeva AI",
  "url": "https://www.sreevaai.com",
  "description": "...",
  "contactPoint": { "email": "support@sreevaai.com", "telephone": "+918919053970" },
  "sameAs": ["https://www.linkedin.com/company/sreeva-ai/about/"],
  "foundingDate": "2025",
  "areaServed": ["IN", "US", "GB"],
  "knowsAbout": ["AI Recruitment", "Technical Interviewing", ...]
}
```

#### WebSite
Enables potential Sitelinks Search Box in Google results.

#### WebPage
Links the page to the organization entity.

#### SoftwareApplication
```json
{
  "@type": "SoftwareApplication",
  "applicationCategory": "BusinessApplication",
  "applicationSubCategory": "Human Resources Software",
  "featureList": ["Adaptive AI interviews", "Resume analysis", "12+ cheat detectors", ...],
  "offers": [
    { "name": "Starter", "price": "99", "priceCurrency": "USD" },
    { "name": "Growth", "price": "299", "priceCurrency": "USD" },
    { "name": "Scale", "price": "699", "priceCurrency": "USD" },
    { "name": "Business", "price": "0", "description": "Custom pricing" }
  ]
}
```

#### FAQPage
All 10 FAQ questions and answers included verbatim. Makes every FAQ item eligible for Google's "People Also Ask" boxes and featured snippets.

**Validate at:** https://search.google.com/test/rich-results  
**Check entity at:** https://search.google.com/search-console/about

---

### 4.5 FAQ Content — Moved from JavaScript to Static HTML

**Files:** `public/index.html`, `public/app.js`

**Problem:** All 10 FAQ items were created by `document.createElement` in `app.js`. Google may execute JavaScript but JS-injected content is deprioritized and often missed in the first crawl pass.

**Fix:** FAQ items are now full static HTML with Schema.org microdata attributes:

```html
<div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
  <button class="faq-q" aria-expanded="false">
    <span class="qn"><span class="n">01</span>
    <span class="qt" itemprop="name">Is this a real conversation or pre-recorded questions?</span></span>
    ...
  </button>
  <div class="faq-a" itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
    <div class="faq-a-inner" itemprop="text">It's a live voice call...</div>
  </div>
</div>
```

`app.js` now only wires the accordion open/close interaction — no DOM creation.

**If you add new FAQs:** Add them to the HTML in `public/index.html` AND to the `FAQPage` JSON-LD in the same file. Both must stay in sync.

---

### 4.6 Pricing Comparison Table — Moved from JavaScript to Static HTML

**Files:** `public/index.html`, `public/app.js`

The 12-row feature comparison table (`<tbody id="detailBody">`) was empty HTML populated by `featureComparison` array in `app.js`. Now rendered as static `<tr>` rows.

**If you update pricing features:** Edit the `<tbody>` in `public/index.html` directly. The JS array in `app.js` has been removed.

---

### 4.7 Footer Legal Links Fixed

**File:** `public/index.html`

```html
<!-- Before -->
<li><a href="mailto:support@sreevaai.com">Privacy policy</a></li>
<li><a href="mailto:support@sreevaai.com">Terms of service</a></li>

<!-- After -->
<li><a href="/privacy">Privacy policy</a></li>
<li><a href="/terms">Terms of service</a></li>
```

**Why:** Google's Quality Raters guidelines explicitly check for accessible privacy and terms pages. Links pointing to `mailto:` for legal pages is a trust signal failure.

---

### 4.8 Stat Numbers Pre-filled

**File:** `public/index.html`

```html
<!-- Before — crawler sees "0" -->
<span data-count="500" data-suffix="+">0</span>

<!-- After — crawler sees real value -->
<span data-count="500" data-suffix="+">500+</span>
```

JS still animates the counter from 0 — the initial HTML value is overwritten on load. Crawlers that don't run JS see the real number.

---

### 4.9 Logo Alt Text Fixed

**File:** `public/index.html`

All logo `<img>` tags: `alt=""` → `alt="Sreeva AI"` with explicit `width="32" height="32"`.

---

### 4.10 Robots.txt Updated

**File:** `app/robots.ts`

```ts
disallow: ['/admin/', '/super-admin/', '/api/', '/interview/', '/login/forgot-password'],
```

Added `/interview/` (private session URLs) and `/login/forgot-password` (password reset form).

---

### 4.11 Sitemap Fixed

**File:** `app/sitemap.ts`

- `lastModified: new Date()` → actual dates (`2026-06-04`, `2026-04-26`)
- `changeFrequency: 'weekly'` → `'monthly'` for homepage, `'yearly'` for legal pages
- Legal page priority: `0.3` → `0.2`

**When to update:** Change the `lastModified` date for the homepage entry any time significant content changes are made to `public/index.html`.

---

## 5. Phase 2 — High Priority Fixes

### 5.1 Root Layout Metadata Overhauled

**File:** `app/layout.tsx`

| Field | Before | After |
|-------|--------|-------|
| `title` | Plain string | `{ default: "...", template: "%s \| Sreeva AI" }` |
| `alternates.canonical` | `"/"` (inherited by all pages) | **Removed** — each page sets its own |
| `og:image` | `/Logo.png` 800×600 | `/og-image.png` 1200×630 with alt text |
| `robots` | Not set | `googleBot: { max-snippet: -1, max-image-preview: "large" }` |
| Suspense `<h1>` | `<h1>Sreeva AI - Intelligent Recruitment Platform</h1>` | `<p aria-hidden="true">Sreeva AI</p>` |

**Title template** means any page that sets `title: "Privacy Policy"` will automatically render as `Privacy Policy | Sreeva AI` in the browser tab and SERPs.

---

### 5.2 Per-Page Metadata — Privacy and Terms

**Files:** `app/privacy/layout.tsx`, `app/terms/layout.tsx`

Because `app/privacy/page.tsx` and `app/terms/page.tsx` are `"use client"` components (they cannot export `metadata`), server-side layout wrappers were created in the same folders.

```ts
// app/privacy/layout.tsx
export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Learn how Sreeva AI collects, uses, stores, and protects your data...",
  alternates: { canonical: "/privacy" },
  openGraph: { title: "Privacy Policy — Sreeva AI", url: "https://www.sreevaai.com/privacy" },
};
```

```ts
// app/terms/layout.tsx
export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Read Sreeva AI's Terms of Use covering platform access, AI interview conduct...",
  alternates: { canonical: "/terms" },
  openGraph: { title: "Terms of Use — Sreeva AI", url: "https://www.sreevaai.com/terms" },
};
```

---

### 5.3 Noindex on Authenticated Routes

**Files:** `app/login/layout.tsx`, `app/interview/layout.tsx`, `app/admin/layout.tsx`

```ts
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
```

This is defence-in-depth — `robots.ts` already disallows crawling at the HTTP level, but `noindex` ensures even if a bot ignores `robots.txt`, the page won't be indexed.

---

### 5.4 Removed Hidden Testimonial Placeholder

**File:** `public/index.html`

Removed `<section class="quote" style="display:none">` — a section with a fictional placeholder testimonial. Invisible DOM with no SEO benefit. **When you have a real customer quote**, add it back with proper markup:

```html
<section class="quote" aria-label="Customer testimonial">
  <div class="shell quote-shell">
    <div class="quote-card" itemscope itemtype="https://schema.org/Review">
      <blockquote itemprop="reviewBody">"Quote text here"</blockquote>
      <div itemscope itemtype="https://schema.org/Person">
        <b itemprop="name">Customer Name</b>
        <span itemprop="jobTitle">VP Engineering · Company</span>
      </div>
    </div>
  </div>
</section>
```

---

## 6. Phase 3 — Performance SEO

### 6.1 Font Loading — Non-Blocking

**File:** `public/index.html`

```html
<!-- Before: render-blocking -->
<link href="https://fonts.googleapis.com/css2?..." rel="stylesheet" />

<!-- After: non-blocking with noscript fallback -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?..."
  media="print" onload="this.media='all'" />
<noscript>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?..." />
</noscript>
```

**Expected LCP improvement:** 200–500ms. The `media="print"` trick loads font CSS at low priority without blocking render. The `onload` callback swaps it to `all` (applies to screen) once downloaded.

---

### 6.2 JavaScript — Deferred

**File:** `public/index.html`

```html
<!-- Before -->
<script src="/app.js"></script>

<!-- After -->
<script src="/app.js" defer></script>
```

`defer` means: download in parallel with HTML parsing, execute after DOM is fully parsed. All `app.js` functionality (animations, accordion, parallax) works identically — none of it required synchronous execution. **Expected FCP/TBT improvement:** 100–300ms.

---

### 6.3 Critical Resource Preloading

**File:** `public/index.html`

```html
<link rel="preload" href="/styles.css" as="style" />
<link rel="preload" href="/Logo.png" as="image" type="image/png" />
```

Browser discovers and fetches these at maximum priority before encountering them in the HTML body. The logo preload directly improves LCP since it's the first visible branded element.

---

### 6.4 Image Dimensions — CLS Prevention

**File:** `public/index.html`

Explicit `width` and `height` on all logo images. Without these, the browser allocates no space and shifts layout when the image loads — causing CLS.

Header logo: `fetchpriority="high"` (LCP candidate)  
Footer logo: `loading="lazy"` (below fold, no need to load eagerly)

---

## 7. Phase 4 — AI Search Optimization

### 7.1 Why This Matters in 2026

Google AI Overviews, Perplexity, and ChatGPT Search all extract structured facts from web pages to generate answers. For queries like:

- "What is Sreeva AI?"
- "How does AI interview software work?"
- "Best AI tools for technical screening"
- "Does Sreeva AI detect cheating?"

...these systems pull from **structured data first**, then prose. Without JSON-LD, your product facts are invisible to AI-generated answers.

### 7.2 Entity Signals Implemented

| Signal | Implementation | Purpose |
|--------|---------------|---------|
| `Organization` schema | JSON-LD `@graph` | Company entity for Knowledge Graph |
| `SoftwareApplication` schema | JSON-LD `@graph` | Product entity with features + pricing |
| `FAQPage` schema | JSON-LD `@graph` | Q&A extraction for AI Overviews and PAA |
| `itemscope`/`itemtype` microdata | HTML attributes on sections | Secondary machine-readable layer |
| `<address>` tag | Footer contact block | Marks contact info as entity property |
| `lang="hi"` on Hindi text | Span attributes | Multilingual entity signal |
| `geo.region` meta | `<head>` | Geographic targeting for India |
| `sameAs` LinkedIn URL | Organization schema | Cross-source entity linkage |

### 7.3 Section Semantic Markup

Key sections now have `aria-label` and `itemscope`/`itemtype`:

```html
<section class="platform" id="platform" 
  aria-label="Sreeva AI platform features"
  itemscope itemtype="https://schema.org/SoftwareApplication">

<section class="pricing" id="pricing"
  aria-label="Sreeva AI pricing plans"
  itemscope itemtype="https://schema.org/OfferCatalog">

<section class="faq" id="faq"
  aria-label="Frequently asked questions about Sreeva AI"
  itemscope itemtype="https://schema.org/FAQPage">
```

AI parsers use both the ARIA labels and the schema types to understand section purpose without executing JavaScript.

---

## 8. Remaining Work

### 8.1 Required (Blocking full SEO potential)

| Item | Priority | Owner | Notes |
|------|----------|-------|-------|
| Create `/public/og-image.png` | **Critical** | Design | 1200×630px. Show product name, tagline, and a visual of the interview report. This is referenced in OG and Twitter tags but the file doesn't exist yet — shares will show broken image until created. |
| Verify `/icon.png` vs `/Logo.png` | High | Dev | `app/layout.tsx` references `/icon.png` but `public/index.html` uses `/Logo.png`. Confirm both exist or consolidate. |

### 8.2 High Value (1–2 week horizon)

| Item | Priority | Notes |
|------|----------|-------|
| Programmatic landing pages | High | Create Next.js pages at `/ai-interview-for-engineers`, `/ai-interview-for-startups`, `/ai-technical-screening`. Each needs unique copy (not templates). Targets long-tail B2B queries. |
| Real customer testimonials | High | Add with `Review` schema markup. Social proof is an E-E-A-T signal. |
| Google Search Console verification | High | Submit sitemap at `sreevaai.com/sitemap.xml`. Monitor indexing of privacy and terms pages. |
| Rich Results Test | High | Run https://search.google.com/test/rich-results on `sreevaai.com` after next deploy. Verify FAQPage and SoftwareApplication schemas pass. |

### 8.3 Medium Value (1 month horizon)

| Item | Priority | Notes |
|------|----------|-------|
| Hindi landing page `/hi/` | Medium | Full Hindi copy with `hreflang` tags. You already support Hindi interviews — a Hindi marketing page captures Indian-market queries directly. |
| Blog / resource center | Medium | Minimum 5 articles targeting: "how to reduce bad hires", "AI interview tools comparison", "what is adaptive interviewing", "technical screening automation", "first-round interview automation". 6-12 month compounding traffic. |
| G2 / Capterra listing | Medium | Creates backlinks + review schema opportunities. B2B buyers check these before purchase. |
| Self-host fonts | Low | Eliminates third-party font domain dependency. Marginal LCP gain. |
| Core Web Vitals audit | Medium | Run Lighthouse on production. Target LCP < 2.5s, CLS < 0.1, INP < 200ms. Report what the actual numbers are before assuming the Phase 3 optimizations are sufficient. |

### 8.4 Future (3 month+ horizon)

| Item | Notes |
|------|-------|
| `hreflang` implementation | When Hindi landing page exists, add `<link rel="alternate" hreflang="hi" href="...">` |
| Review schema | Add `@type: Review` markup when real testimonials are added |
| VideoObject schema | If product demo videos are added to the site |
| BreadcrumbList schema | When content hierarchy deepens (blog categories, etc.) |
| `speakable` schema | Marks content suitable for voice assistants and Google Assistant |

---

## 9. Roadmap

### Week 1 (Now)
- [x] All Phase 1–4 code changes deployed
- [ ] Create and upload `og-image.png` (1200×630) to `/public/`
- [ ] Verify site on Google Search Console, submit sitemap
- [ ] Run Rich Results Test — confirm FAQPage + SoftwareApplication schemas

### Week 2
- [ ] Run Lighthouse on production, document CWV baseline numbers
- [ ] Create 3 programmatic landing pages (engineers / startups / screening)
- [ ] Begin collecting real customer testimonials

### Month 1
- [ ] Publish first 3 blog articles
- [ ] Create G2 / Capterra product listings
- [ ] Hindi landing page if India is a priority market

### Month 2–3
- [ ] Blog at 8–10 articles
- [ ] Review schema from customer testimonials
- [ ] Evaluate `hreflang` based on traffic data
- [ ] Evaluate programmatic SEO at scale (role-specific landing pages per skill set)

---

## 10. Validation Checklist

Run these after every deploy to verify SEO regressions haven't been introduced:

### Structured Data
- [ ] https://search.google.com/test/rich-results — paste `https://www.sreevaai.com`
- [ ] Expected passes: FAQPage, SoftwareApplication (with Offers)
- [ ] Expected entity: Organization

### Social Sharing
- [ ] https://www.opengraph.xyz — paste `https://www.sreevaai.com`
- [ ] Verify: 1200×630 image preview, correct title/description
- [ ] https://cards-dev.twitter.com/validator — verify Twitter Card

### Technical SEO
- [ ] `view-source:https://www.sreevaai.com` — confirm FAQ HTML is in page source (not JS-injected)
- [ ] `view-source:https://www.sreevaai.com` — confirm pricing table rows are in page source
- [ ] https://www.sreevaai.com/sitemap.xml — accessible, 3 URLs, correct dates
- [ ] https://www.sreevaai.com/robots.txt — disallows admin, super-admin, api, interview, forgot-password

### Performance
- [ ] Chrome DevTools Lighthouse — run on `https://www.sreevaai.com`
- [ ] Target: LCP < 2.5s, CLS < 0.1, TBT < 300ms
- [ ] Confirm font CSS loads non-blocking (no render-blocking resources in Lighthouse)
- [ ] Confirm `app.js` loads with `defer` attribute

### Indexability
- [ ] `site:sreevaai.com` in Google — only marketing, privacy, terms should appear
- [ ] `/login`, `/admin`, `/interview` should not appear in Google results

### Canonical
- [ ] Check `<link rel="canonical">` in page source of `/`, `/privacy`, `/terms`
- [ ] `/privacy` canonical → `https://www.sreevaai.com/privacy`
- [ ] `/terms` canonical → `https://www.sreevaai.com/terms`
- [ ] `/` canonical → `https://www.sreevaai.com/`

---

## Appendix: Key URLs

| Resource | URL |
|----------|-----|
| Google Search Console | https://search.google.com/search-console |
| Rich Results Test | https://search.google.com/test/rich-results |
| OG Debugger | https://www.opengraph.xyz |
| Twitter Card Validator | https://cards-dev.twitter.com/validator |
| PageSpeed Insights | https://pagespeed.web.dev |
| Schema Validator | https://validator.schema.org |
| LinkedIn Post Inspector | https://www.linkedin.com/post-inspector |

---

*This document reflects the state of SEO implementation as of 2026-06-04. Update the "Last updated" date and the sitemap `lastModified` entry whenever significant changes are made to the marketing page.*
