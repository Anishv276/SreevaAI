# SreevaAI Design System

## Fonts

| Surface | Font | Source |
|---|---|---|
| App (Next.js pages) | **Geist Sans** | `geist` npm package — `GeistSans.variable` → CSS var `--font-geist-sans` |
| Landing page (`public/`) | **DM Sans** | Google Fonts CDN (synchronous, no `media="print"`) |
| Landing page headings | **Instrument Serif** | Google Fonts CDN |
| Landing page monospace | **JetBrains Mono** | Google Fonts CDN |

### App font usage
```tsx
// app/layout.tsx
import { GeistSans } from "geist/font/sans";
<html className={GeistSans.variable}>
```
```css
/* globals.css */
font-family: var(--font-geist-sans), system-ui, sans-serif;
```

---

## Color Tokens

### Primary Palette
| Name | Hex | Usage |
|---|---|---|
| Primary Violet | `#7C3AED` | Focus rings, active states, icon accents |
| Light Violet | `#8B5CF6` | Gradient start, button primary |
| Deep Violet | `#6D28D9` | Hover states |
| Accent Blue | `#3B82F6` | Gradient end, secondary accent |
| Soft Blue | `#60A5FA` | Charts, skill bars |

### Backgrounds
| Token | Value | Usage |
|---|---|---|
| Page background | `linear-gradient(180deg, #FFFFFF 0%, #FAFAFC 45%, #F5F3FF 100%)` | Every app page (fixed attachment) |
| Card background | `#FFFFFF` | All cards |
| Section background | `#FAFAFC` | Modal body, secondary sections |
| Muted background | `#F5F3FF` | Violet tint backgrounds |
| Input background (rest) | `#F9FAFB` | Form inputs unfocused |

### Borders
| Token | Value | Usage |
|---|---|---|
| Primary border | `#E9E7FF` | Cards, inputs, modals, all containers |
| Subtle border | `#F0EEF8` | Table row dividers, card section dividers |

### Text
| Token | Value | Usage |
|---|---|---|
| Primary text | `#111827` | Headings, body |
| Secondary text | `#6B7280` | Labels, subtitles |
| Muted text | `#9CA3AF` | Placeholders, timestamps |

### Semantic
| State | Color |
|---|---|
| Success | `#10B981` / `bg-emerald-500` |
| Warning | `#B45309` |
| Danger | `#EF4444` / `bg-red-500` |
| Info | `#3B82F6` |

---

## Gradients

### Primary button gradient
```css
background: linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%);
box-shadow: 0 4px 14px rgba(124,58,237,0.3);
```

### Page background
```css
background: linear-gradient(180deg, #FFFFFF 0%, #FAFAFC 45%, #F5F3FF 100%);
background-attachment: fixed;
```

### Org avatar / logo badge
```css
background: linear-gradient(135deg, #8B5CF6, #3B82F6);
```

### Nav active indicator pip
```css
background: linear-gradient(135deg, #8B5CF6, #3B82F6);
```

---

## Spacing System (8px base)

| Scale | Value | Usage |
|---|---|---|
| xs | 4px | Gap between icon and label |
| sm | 8px | Compact padding |
| md | 12px | Input padding, small gaps |
| lg | 16px | Standard gap |
| xl | 24px | Section gaps |
| 2xl | 32px | Card padding |
| 3xl | 40px | Section padding |
| 4xl | 48px | Large section gaps |

---

## Border Radius

| Element | Value |
|---|---|
| Inputs | `rounded-xl` (12px) |
| Buttons | `rounded-xl` (12px) |
| Cards | `rounded-2xl` (16px) |
| Modals | `rounded-2xl` (16px) |
| Avatars / icon badges | `rounded-xl` (12px) |
| Table container | `rounded-2xl` (16px) |
| Dropdown menus | `rounded-xl` (12px) |
| Badges / pills | `rounded-full` or `rounded-md` |

---

## Shadows

| Context | Value |
|---|---|
| Cards (default) | `0 1px 3px rgba(124,58,237,0.04)` |
| Cards (hover) | `0 4px 16px rgba(124,58,237,0.08)` |
| Modals | `0 25px 60px rgba(124,58,237,0.12)` |
| Primary button | `0 4px 14px rgba(124,58,237,0.3)` |
| Sidebar | `2px 0 12px rgba(124,58,237,0.04)` |

---

## Typography Scale

| Role | Class | Size | Weight |
|---|---|---|---|
| Page title (h1) | `text-2xl font-semibold tracking-tight` | 24px | 600 |
| Section heading | `text-base font-semibold` | 16px | 600 |
| Card title | `text-sm font-semibold` | 14px | 600 |
| Body | `text-sm` | 14px | 400 |
| Label (uppercase) | `text-xs font-semibold uppercase tracking-wider` | 11px | 600 |
| Caption / meta | `text-xs text-gray-400` | 12px | 400 |
| Monospace badge | `text-[10px] font-semibold uppercase tracking-wide` | 10px | 600 |

**Do NOT use:**
- `font-black` on page titles
- `font-[800]` or other arbitrary font weights
- `text-4xl` / `text-5xl` on page headings
- `uppercase tracking-widest` with `font-bold` (looks old)
- `zoom: 0.X` on any page wrapper

---

## Layout

### Admin layout content area
```tsx
// app/admin/layout.tsx — content wrapper
<div id="admin-content-inner" className="px-6 pt-6 pb-10 md:px-8 md:pt-8 lg:px-10">
```

### Super-admin layout content area
```tsx
// app/super-admin/shell.tsx — content wrapper
<div className="px-6 pt-6 pb-10 md:px-8 md:pt-8 lg:px-10">
```

### Page wrapper (every page)
```tsx
<div className="space-y-6 pb-10 animate-in fade-in duration-500">
```

### Page header (every page)
```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Page Title</h1>
    <p className="text-sm text-gray-400 mt-0.5">Subtitle or count</p>
  </div>
  <div className="flex items-center gap-2.5">
    {/* actions */}
  </div>
</div>
```

### Sidebar width
- Admin sidebar: `w-[240px]`, fixed left
- Super-admin sidebar: `w-[240px]`, fixed left
- Main content offset: `md:pl-[240px]` (admin) / `ml-[240px]` (super-admin)

---

## Component Patterns

### Card
```tsx
<div className="bg-white rounded-2xl" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
```

### Card with title bar
```tsx
<div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E9E7FF", ... }}>
  <div className="px-5 py-4" style={{ borderBottom: "1px solid #F0EEF8" }}>
    <h2 className="text-sm font-semibold text-gray-900">Title</h2>
    <p className="text-xs text-gray-400 mt-0.5">Subtitle</p>
  </div>
  <div className="p-5">{/* content */}</div>
</div>
```

### Primary button
```tsx
<button className="btn-shimmer inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-medium text-white transition-all"
  style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}>
  Label
</button>
```

### Secondary button
```tsx
<button className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-white text-sm font-medium text-gray-600 hover:text-violet-600 hover:bg-violet-50 transition-all"
  style={{ border: "1px solid #E9E7FF" }}>
  Label
</button>
```

### Input
```tsx
<input className="h-10 w-full rounded-xl bg-gray-50 text-sm outline-none transition-all"
  style={{ border: "1px solid #E9E7FF" }}
  onFocus={e => { e.target.style.borderColor = "#7C3AED"; e.target.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.1)"; e.target.style.background = "#fff"; }}
  onBlur={e => { e.target.style.borderColor = "#E9E7FF"; e.target.style.boxShadow = "none"; e.target.style.background = "#F9FAFB"; }}
/>
```

### Dropdown menu
```tsx
<DropdownMenuContent className="w-44 p-1.5 rounded-xl shadow-xl bg-white" style={{ border: "1px solid #E9E7FF" }}>
  <DropdownMenuItem className="cursor-pointer rounded-lg px-2.5 py-2 text-sm text-gray-700 hover:bg-violet-50 hover:text-violet-700 font-medium">
    Action
  </DropdownMenuItem>
</DropdownMenuContent>
```

### Table header row
```tsx
<tr style={{ background: "#F9F8FF", borderBottom: "1px solid #F0EEF8" }}>
  <th className="px-4 py-3 text-left font-semibold text-xs text-gray-400 uppercase tracking-wider">Col</th>
</tr>
```

### Modal
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-sm p-4">
  <div className="w-full max-w-md bg-white rounded-2xl animate-in zoom-in-95 duration-200"
    style={{ border: "1px solid #E9E7FF", boxShadow: "0 25px 60px rgba(124,58,237,0.12)" }}>
    <div className="px-6 py-5" style={{ borderBottom: "1px solid #F0EEF8" }}>
      <h2 className="text-lg font-semibold text-gray-900">Title</h2>
    </div>
    <div className="p-6">{/* content */}</div>
  </div>
</div>
```

### Sidebar nav item (active)
```tsx
// Active state
style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.06))", border: "1px solid rgba(139,92,246,0.15)" }}
className="text-violet-700"

// Active pip
<div className="absolute right-2.5 w-1.5 h-5 rounded-full"
  style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)" }} />
```

---

## Landing Page (`public/`)

The landing page is a **static HTML+CSS+JS** file — NOT a Next.js page.

| File | Role |
|---|---|
| `public/index.html` | HTML structure, all content |
| `public/styles.css` | All CSS, uses CSS custom properties |
| `public/app.js` | Scroll animations, IntersectionObserver reveals |

### Landing CSS tokens
```css
:root {
  --primary: #7C3AED;
  --primary-soft: #DDD6FE;
  --primary-tint: #F5F3FF;
  --primary-deep: #6D28D9;
  --ink: #111827;
  --muted: #6B7280;
  --line: #E9E7FF;
  --bg: #FAFAFC;
  --sans: "DM Sans", system-ui, sans-serif;
  --serif: "Instrument Serif", serif;
  --mono: "JetBrains Mono", monospace;
}
```

### Critical: CSS must be valid
The landing page CSS brace depth **must be 0** (balanced). Verify with:
```js
node -e "const fs=require('fs');const css=fs.readFileSync('public/styles.css','utf8');let d=0;css.split('\n').forEach(l=>{d+=(l.match(/\{/g)||[]).length-(l.match(/\}/g)||[]).length});console.log('depth:',d,d===0?'OK':'BROKEN')"
```
If depth ≠ 0, every CSS rule after the broken line is ignored by the browser.

### Font loading (landing page)
Fonts must load **synchronously** (no `media="print"` / `onload` pattern):
```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap" />
```

---

## Things NOT to do

| ❌ Bad | ✅ Good |
|---|---|
| `style={{ zoom: 0.78 }}` on page wrapper | Remove zoom, fix layout properly |
| `font-black text-4xl` on page h1 | `font-semibold text-2xl` |
| `bg-gray-50` as page background | Use gradient background |
| `border border-gray-200` on cards | `style={{ border: "1px solid #E9E7FF" }}` |
| `shadow-xl bg-white/95 backdrop-blur-xl` | `bg-white` + violet shadow |
| `rounded-[2.5rem]` or `rounded-[18px]` | `rounded-2xl` |
| `font-[800]`, `font-[700]` arbitrary weights | `font-bold`, `font-semibold` |
| `tracking-[0.2em]` arbitrary tracking | `tracking-wider` or `tracking-widest` |
| ALL CAPS menu items | Sentence case |
| `text-orange-*` / `#F97316` / `#ff6a00` | Violet equivalents |
| `text-slate-*` colors | `text-gray-*` colors |
| Deferred font loading with `media="print"` | Direct `<link rel="stylesheet">` |
