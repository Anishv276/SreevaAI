# Security Audit Report — HR Interview Platform

**Date:** 2026-06-03 (updated; initial audit 2026-06-02)
**Stack:** Next.js (App Router) + Python/LiveKit agent + PostgreSQL (Prisma) + Redis + R2/S3
**Auditor:** Internal security review (two-pass: initial static + deep follow-up)
**Status:** Pre-production. **Not safe to expose to real users yet.**

> **How to read this:** Severity goes Critical → High → Medium → Low.
> Each issue has a plain-English explanation and the exact file/line.
> All findings are from static analysis; items marked **UNKNOWN RISK** need runtime verification.

---

## Executive Risk Summary

| Area | Risk Level | Summary |
|------|-----------|---------|
| Authentication | **Critical** | Auth middleware (`proxy.ts`) is **not registered** — Next.js only runs a file named `middleware.ts`. All route-level gating is dead code. |
| Authorization | **Critical** | Many routes check only `if (!session)` with no role/org enforcement; `orgId` taken from client query params. IDOR + privilege escalation. |
| Cross-Tenant Data | **Critical** | `candidates/export` accepts attacker-controlled `orgId` → full CSV dump of any org. SSE stream leaks PII across all orgs with no auth. |
| SSRF | **High** | `extract/route.ts` does `fetch(userUrl)` unauthenticated, no allowlist. Reaches cloud metadata, internal Redis/Postgres. |
| Missing Auth on Admin Routes | **High** | Voice preview TTS endpoints, resume-screening upload, scan, and SSE stream have zero authentication. |
| Weak Crypto | **High** | OTPs generated with `Math.random()` (non-CSPRNG). Predictable codes → account takeover. |
| Session Management | **High** | In-memory session cache skips revocation for 5s; dev fast-path skips all revocation; hardcoded JWT dev fallback secret. |
| Interview Integrity | **High** | Proctoring endpoint lets unauthenticated callers inject fake fraud events and force-create Interview records for any candidate. |
| API Security | **High** | Several mutation endpoints gated only by `INTERVIEW_TOKEN_REQUIRED` which is off outside production. |
| Data Validation | **Medium** | Inconsistent schema validation; `candidates/[id]` PATCH mass-assignment; CSV injection in export. |
| DB Security | **Medium** | `$executeRawUnsafe` used widely; DB TLS `require` not `verify-full`. |
| Caching | **Medium** | PII cached with `max-age=60`; module-global session cache shared across requests. |
| Secrets | **High** | Real keys in `.env`; secrets were committed in git history — must rotate. |

**Overall Risk Score: 82 / 100 (Critical-High).**
**Production-ready: NO.**

---

## 1. Authentication

| File | Issue | Severity | Explanation | Fix |
|------|-------|----------|-------------|-----|
| `proxy.ts` + missing `middleware.ts` | **Middleware never runs** | **Critical** | Next.js only executes middleware from root `middleware.ts`/`.js`. This file is `proxy.ts` exporting `proxy`. `.next/server/middleware-manifest.json` → `middleware: []`. Every redirect/role gate here is dead. | Create root `middleware.ts` re-exporting `proxy as middleware` + its `config`. Re-test all route protections. |
| `lib/auth.ts:90-95` | **Dev fast-path skips revocation** | High | When `NODE_ENV !== "production"`, blacklist + pwd-change checks are skipped entirely. If prod ever runs without `NODE_ENV=production`, logout/blacklist is a no-op. | Make revocation checks unconditional; gate only latency optimization, never the security check. |
| `lib/auth.ts:6-16` | **Hardcoded dev JWT fallback secret** | Medium | `"development-jwt-fallback-secret-keep-secure"` used if `JWT_SECRET` unset and not prod. | Require `JWT_SECRET` always; fail closed in all envs. |
| `lib/auth.ts:53-58` | **7-day JWT, no rotation, no jti** | Medium | Long-lived stateless tokens; revocation only via Redis blacklist that the dev path and 5s cache can bypass. | Shorten TTL, add `jti`, ensure blacklist always consulted. |
| `app/api/auth/login/route.ts:90` | User-existence timing oracle | Low | bcrypt only runs for existing users; non-existent users skip it → timing reveals valid emails. | Always run a dummy bcrypt compare for unknown users. |

---

## 2. Authorization & Permissions

| File | Issue | Severity | Explanation | Fix |
|------|-------|----------|-------------|-----|
| `app/api/candidates/[id]/route.ts` (DELETE/PATCH) | **No role check; client-supplied `orgId`** | **Critical** | `orgId = searchParams.get("orgId") \|\| session.orgId`. Only `if (!session)` gates it — a CANDIDATE-role session can delete/modify candidates. | Enforce admin role; derive orgId from session only. |
| `app/api/candidates/export/route.ts:12-13` | **Cross-tenant IDOR — full CSV dump** | **Critical** | `const orgId = searchParams.get("orgId") \|\| session.orgId`. A logged-in admin can pass `?orgId=<victim_org>` and receive the full candidate CSV (name, email, phone, AI score, resume/interview status) for any other organization. No ownership cross-check. | Derive orgId exclusively from `session.orgId`; ignore query param entirely. |
| `app/api/stream/route.ts:1-85` | **Unauthenticated SSE leaks PII cross-org** | **Critical** | No `getSession()` call anywhere. Queries `Application` table with only a time-window filter — no org scoping. Any unauthenticated client gets real-time `fullName`, `email`, `createdAt`, `id` for new applications across every organization. | Require auth; scope query to `session.orgId`; don't broadcast cross-org data. |
| `app/api/drives/[id]/resume-screening/route.ts` (POST) | **No authentication at all** | **Critical** | Takes `driveId` from URL and uploads/queues resumes with no session check. Anyone can upload to any drive. | Add admin auth + verify drive belongs to caller's org. |
| `app/api/admin/voice/preview/route.ts` + `sarvam/route.ts` | **No auth — paid TTS API abuse** | High | Both routes call TTS providers (Cartesia, ElevenLabs, Sarvam) with no `getSession()` call. Unauthenticated attackers can make unlimited paid TTS requests burning platform API credits. | Add `getSession()` + admin role check at the top of both handlers. |
| `app/api/drives/[id]/resume-screening/candidates/[candidateId]/route.ts` | No auth | High | No session check on candidate-level screening route. | Add auth + org ownership check. |
| `app/api/drives/[id]/resume-screening/download/route.ts` | No auth | High | Downloadable screening data with no session check. | Add auth + org ownership check. |
| `app/api/candidates/[id]/scan/route.ts` | No auth | High | No session reference in file. | Add admin auth. |
| All `app/api/admin/**` & `/api/super-admin/**` | **Rely on dead middleware** | **Critical** | Since middleware doesn't run, these are only as protected as their own code; many only check `if (!session)`. | Add explicit role check at top of every handler. |
| `app/api/extract/route.ts:56-63` | Auth optional, orgId spoofable | High | `getSession()` wrapped in try/catch that swallows failure; `orgId` from `explicitOrgId` form field. | Require valid session; ignore client orgId. |
| Pattern (~16+ routes) | **No central authz layer** | High | Each route re-implements (or forgets) checks. 28+ of 71 routes have no `getSession` reference. | Introduce one `requireAuth(role)` wrapper used by every protected route. |

---

## 3. Security Vulnerabilities (OWASP)

| Type | Location | Severity | Explanation | Fix |
|------|----------|----------|-------------|-----|
| **SSRF** | `app/api/extract/route.ts:85` | **High** | `fetch(url)` on raw user input, unauthenticated, no allowlist, route excluded from middleware matcher. Reaches `169.254.169.254`, `localhost:6379`, internal hosts. | Require auth; enforce https; resolve DNS and block private/link-local ranges; disable redirects; timeout + size cap. |
| **Weak crypto** | `forgot-password/route.ts:48`, `otp/send/route.ts:38` | **High** | `Math.floor(100000 + Math.random()*900000)` — `Math.random()` is not a CSPRNG; 6-digit space = brute-forceable. | Use `crypto.randomInt(100000, 1000000)`; add lockout after N failures. |
| **IDOR / Cross-tenant** | `candidates/export/route.ts:12-13` | **Critical** | See §2. Full candidate CSV for any org via `?orgId=`. | Derive orgId from session. |
| **Broken auth** | `interview/finalize`, `egress`, `proctoring`, `upload/interview-snapshot` | High | Gated only by `isInterviewTokenRequired()` which returns false when `INTERVIEW_ACCESS_TOKEN_REQUIRED` env var unset. | Always require the interview access token regardless of env. |
| **Proctoring integrity injection** | `app/api/interview/proctoring/route.ts:65-67, 140-156` | High | When `isInterviewTokenRequired()` is false, any caller can POST arbitrary `applicationId` + high-severity proctoring events (`face_absence`, `multiple_faces`, `identity_mismatch`) with no auth. Also creates `Interview` rows via upsert for arbitrary application IDs, poisoning candidate records. Attacker can enumerate application IDs via the unauthenticated SSE stream (Finding §2). | Make interview token always required; scope proctoring writes to verified application ownership. |
| **CSV injection** | `app/api/candidates/export/route.ts:32-41` | Medium | Candidate-controlled fields (`fullName`, `email`, `phone`) are not stripped of formula characters (`=`, `+`, `-`, `@`). A candidate registers with `fullName=HYPERLINK("http://evil.com","click")` → formula executes when HR admin opens CSV in Excel/Google Sheets. | Strip or escape `=`, `+`, `-`, `@` at the start of any CSV field value; prefix with tab or single-quote. |
| **CSRF** | All cookie-auth POST routes | Medium | Session cookie is `sameSite: lax` (helps) but no CSRF tokens on mutation routes. | Add CSRF tokens or `sameSite: strict` for mutating routes. |
| **XSS** | `app/admin/layout.tsx:129` | Low | `dangerouslySetInnerHTML` — content appears static (CSS). | Confirm static; if dynamic, sanitize. |
| **Exposed secrets** | `.env`, deleted `livekit.yaml`/`egress.yaml` | High | Real LiveKit/Redis/OpenAI/Resend/Pinecone keys present; YAML files were committed in git history. | Rotate LiveKit key/secret, Redis password, review OpenAI/Resend/Pinecone. Purge history if feasible. |
| **SQL injection** | All `$executeRawUnsafe`/`$queryRaw` sites | **None found ✅** | Every raw site uses `$1,$2` bound params. | Keep parameterized; prefer Prisma query builder. |
| **Insecure deserialization / code exec** | Python files (agent.py, behavioral_analysis.py, interview/) | **None found ✅** | No `yaml.load`, pickle, `eval` on user input. `runPythonJson` in worker.ts uses `spawn()` with array args (no shell injection). | — (safe) |

---

## 4. Caching Layer

| Component | Issue | Risk | Explanation | Fix |
|-----------|-------|------|-------------|-----|
| `lib/auth.ts:65-95` session cache | **Auth-state staleness** | High | Module-global `Map<token, user>` flushed every 5s. Once cached, blacklist/pwd-change is NOT re-checked for up to 5s; dev path never checks. Map is process-global → shared across requests. | Scope cache per-request; always re-check revocation. |
| `app/api/candidates/[id]/route.ts:94` | **PII cached** | Medium | `Cache-Control: private, max-age=60` on full candidate PII (email, phone, resume, scores). | Use `no-store` for PII. |
| `super-admin/exchange-rate/route.ts` | `public, s-maxage=3600` | Low | Public non-sensitive data — acceptable. | OK. |

---

## 5. Rate Limiting & Abuse Protection

| Endpoint | Issue | Severity | Explanation | Fix |
|----------|-------|----------|-------------|-----|
| `auth/verify-otp` | **No rate limit at all** | **High** | OTP brute-forceable; combined with `Math.random()` 6-digit codes → realistic account takeover. | Strict per-email + per-IP limit; invalidate OTP after N failures. |
| `lib/rate-limit.ts:8,33` | **Fails open** | High | Returns `false` (allowed) when Redis is down or errors. | Fail closed for auth-sensitive limiters. |
| `extract/route.ts:10` | **Key = `x-forwarded-for`** | Medium | Trivially spoofable header → bypass. | Use trusted proxy IP or authenticated identity. |
| `auth/login` | Per-email only (5/60s) | Medium | Distributed credential-stuffing across many emails not limited per-IP. | Add per-IP limit alongside per-email. |
| `lib/rate-limit.ts:59-60` | Limits too high | Medium | `submission=2000/hr`, `extraction=10000/hr` → effectively no protection. | Set realistic thresholds. |

---

## 6. Session & Token Security

| Area | Issue | Severity | Explanation | Fix |
|------|-------|----------|-------------|-----|
| JWT secret | Dev fallback hardcoded | High | `lib/auth.ts:15`. | Always require env secret. |
| Revocation | Bypassed by dev path + 5s cache | High | See §1 / §4. | Always consult blacklist/pwd-change. |
| Cookie flags | `secure` only in prod, `sameSite: lax`, no CSRF token | Medium | Acceptable but no CSRF defense; `secure` depends on NODE_ENV. | Add CSRF defense; enforce HTTPS at infra. |
| LiveKit token | 2h publish token, room-scoped | Low-Med | Reasonable, but issuance is unauth when interview token not required. | Tie issuance to interview access token always. |

---

## 7. Data Validation & Input Handling

| File | Issue | Severity | Explanation | Fix |
|------|-------|----------|-------------|-----|
| `candidates/[id]` PATCH | Mass-assignment risk | Medium | Spreads `body.*Status` into update with light normalization, no schema. | Validate with Zod allowlist of fields/values. |
| `candidates/export` | CSV injection | Medium | See §3 — formula chars not escaped. | Sanitize formula trigger chars in CSV output. |
| Many routes | No schema on `request.json()` | Medium | `finalize` uses Zod (good); most routes don't. | Standardize Zod validation. |
| `extract/route.ts` | Trusts `content-length` header | Low | 20MB cap + type allowlist ✅, but header is spoofable. | Also cap actual stream size. |

---

## 8. Logging & Sensitive Data Leaks

| File | Issue | Severity | Explanation | Fix |
|------|-------|----------|-------------|-----|
| `extract/route.ts:81,96` | Logs scraped URL | Low | User-supplied URL logged (aids SSRF recon). | Reduce verbosity in prod. |
| Across routes | Full `error` objects logged | Medium | `console.error("...", error)` may include DB errors / connection strings / stacks. | Central logger with redaction; log codes not raw objects in prod. |
| OTP routes | OTP value **not** logged | — (good) | Verified codes aren't printed. | Keep it that way. |
| `lib/redis.ts:26-35` | Global `console.log/warn` monkeypatch | Low | Can mask other logs / obscure incident data. | Filter at logger config, not global override. |

---

## 9. Database Security

| Area | Issue | Severity | Explanation | Fix |
|------|-------|----------|-------------|-----|
| Raw SQL sites (`finalize`, `recording`, `worker.ts`) | `$executeRawUnsafe` widely used | Medium | **No SQLi found** — all use bound `$1,$2` params ✅. But the unsafe API is fragile if someone later interpolates a string. | Prefer Prisma query builder; if raw needed, keep parameterized and code-review every site. |
| `lib/prisma.ts:13` | DB TLS `sslmode=require` | Medium | `require` encrypts but does **not** verify the server cert → MITM possible. | Use `verify-full` with a CA cert in production. |

---

## 10. Concurrency & Edge Cases

| Area | Issue | Severity | Explanation | Fix |
|------|-------|----------|-------------|-----|
| `lib/auth.ts` `_sessionCache` | Process-global mutable map | High | Shared across all concurrent requests; revocation-staleness window. | Per-request scope. |
| `lib/rate-limit.ts` | Window race | Low-Med | zadd then zcard not atomic against concurrent callers near the boundary; minor over-allow. | Acceptable, or use Lua script for atomic count+limit. |
| `interview/finalize` billing | Double-billing guard in app logic | Medium (UNKNOWN) | Comments claim atomic "mark-and-deduct" via billingSnapshot; needs verification under concurrent finalize + agent completion. | Verify with DB-level conditional update / unique constraint. |
| `lib/prisma.ts` pool `max: 3` | Low pool under load | Low | May serialize/timeout under burst (reliability, not security). | Tune for expected concurrency. |

---

## Top 12 Critical Fixes Before Production

1. **Wire up middleware** — create root `middleware.ts`; verify manifest lists it and all gates fire.
2. **Central `requireAuth(role)` wrapper** applied to every `/api/admin/**`, `/api/super-admin/**`, and object route.
3. **Fix cross-tenant IDOR in `candidates/export`**: derive `orgId` exclusively from `session.orgId`; never accept from query param.
4. **Authenticate `stream/route.ts` SSE endpoint** and scope to `session.orgId` — currently leaks PII cross-org to anyone.
5. **Authenticate voice preview TTS routes** (`/api/admin/voice/preview` + `/sarvam`) — currently allow unauthenticated paid API abuse.
6. **Fix IDOR in `candidates/[id]`** and siblings: derive `orgId` from session only; require admin role for DELETE/PATCH.
7. **Authenticate `resume-screening` upload routes** (currently fully open).
8. **SSRF in `extract`**: require auth + URL allowlist/private-range blocking + redirect/timeout/size limits.
9. **OTP crypto**: replace `Math.random()` with `crypto.randomInt`; add rate limit + attempt lockout to `verify-otp`.
10. **Make interview token always required**: make `isInterviewTokenRequired()` always true; protect `finalize`/`egress`/`proctoring`/snapshot upload; prevents proctoring integrity injection.
11. **Revocation correctness**: remove dev fast-path bypass; always consult blacklist/pwd-change; scope session cache per-request.
12. **Rotate exposed secrets** (LiveKit key/secret, Redis password; review OpenAI/Resend/Pinecone) and require `JWT_SECRET` in all envs.

---

## Audit Coverage

**Covered in depth (pass 1 + pass 2):**
- `lib/auth.ts`, `lib/rate-limit.ts`, `lib/redis.ts`, `lib/prisma.ts`, `proxy.ts`
- All `app/api/auth/**` routes
- `app/api/candidates/**` (all routes including export, scan, [id])
- `app/api/drives/**` (resume-screening and non-screening routes)
- `app/api/extract/route.ts`
- `app/api/stream/route.ts`
- `app/api/admin/voice/preview/**`
- `app/api/interview/proctoring/route.ts`, `finalize`, `egress`, `upload/interview-snapshot`
- `worker.ts` — raw SQL, BullMQ job processing, spawn patterns
- Python files: `agent.py`, `behavioral_analysis.py`, `convert_raw.py`, `interview/` directory
- `.env` / secrets posture, git history YAML files
- Build middleware manifest

**Not exhaustively line-read (recommended follow-up):**
- Remaining `app/api/admin/**` and `app/api/super-admin/**` handlers (sampled; high-risk ones covered)
- All 71 API routes individually — approximately 30 were sampled

**Python security verdict:** No subprocess shell injection, pickle, `yaml.load`, or `eval` on user input found. `runPythonJson` in `worker.ts` uses `spawn()` with array argument list — no shell injection. Python agent side is clean.

---

# Re-Audit & Remediation — 2026-06-10

**Trigger:** Fresh end-to-end review with an attacker mindset, focused on the new JWT / sliding-session model and on tenant-isolation boundaries. The session model is now: **2h JWT cookie with a sliding refresh** (re-issued when <30 min remain), **rotating in-memory secret** (2h cycle, 1-cycle grace, seeded from `.env` on cold start), and **logout blacklist** (2h TTL in Redis). This section records what was found in this pass and the exact fixes applied.

## What was fixed in this pass

| # | Severity | File / Location | Vulnerability | Root Cause | Fix |
|---|----------|-----------------|---------------|------------|-----|
| R1 | **Critical** | `proxy.ts` was never wired as middleware (no root `middleware.ts`; manifest empty) | All route-level auth gating was dead code; the file also held an insecure parallel auth impl primed to activate the moment it ran | Next.js only auto-loads middleware from a root `middleware.ts` | Created root `middleware.ts` re-exporting `proxy as middleware` + `config`; hardened `proxy.ts` (R2–R4) before activating it |
| R2 | **High** | `proxy.ts:5` | Hardcoded JWT fallback secret `"development-jwt-fallback-secret-keep-secure"` used for **verification** when `JWT_SECRET` unset → forge a `SUPER_ADMIN` token | Guessable constant baked into source; fails *open* | Removed the constant; secret derivation moved to shared `lib/session-secret.ts` which **fails closed** (random per-process key when seed absent — forces re-login, never trusts a constant) |
| R3 | **High** | `proxy.ts:65` | Refresh issued **7-day** tokens while the logout blacklist TTL is only 2h → a refreshed token outlives revocation | Expiry mismatch between the two auth layers | Edge middleware no longer re-signs tokens at all; token issuance/refresh is owned solely by the Node layer (`lib/auth.ts`, 2h) so nothing can outlive the blacklist |
| R4 | **Medium** | `proxy.ts` vs `lib/auth.ts` | Two divergent rotating-secret implementations; Edge & Node isolates would drift after the first rotation, and the Edge layer never consulted the Redis blacklist | Duplicated, inconsistent crypto | Single source of truth in `lib/session-secret.ts`. Edge middleware verifies against a **stable env-seeded key** (no drift) as a first-layer *page* gate; authoritative revocation (blacklist + pwd-change) stays in `verifySession()` in the Node API layer that every data route already calls |
| R5 | **High** | `app/api/candidates/[id]/route.ts` GET | Org check ran in JS **after** the DB fetch and only fired when *both* `session.orgId` and `candidateOrgId` were non-null → an orphaned-drive (null orgId) candidate's full PII/transcript leaked to any admin | Post-fetch guard with a null short-circuit; no DB-level scoping | Enforced org ownership in the `findFirst` **WHERE clause** (`drive.orgId = session.orgId`, SUPER_ADMIN exempt); deleted the flawed post-fetch check |
| R6 | **Critical** | `app/api/candidates/[id]/route.ts` DELETE & PATCH | `orgId` taken from query string with no role gate → any admin could pass `?orgId=<victim_org>` and delete/modify another tenant's candidates | Confused-deputy: untrusted query param used as the ownership filter | Only `SUPER_ADMIN` may supply `?orgId`; every other role is forced to `session.orgId` |
| R7 | **Critical** | `app/api/candidates/route.ts` DELETE (bulk) | Same `?orgId` confused-deputy on bulk delete | Same as R6 | Same SUPER_ADMIN gate applied |
| R8 | **Critical** | `app/api/candidates/export/route.ts` GET | `orgId = searchParams.get("orgId") \|\| session.orgId` with **no role gate** → `?orgId=<victim_org>` dumps every other tenant's candidate PII (name, email, phone, scores) as CSV | Untrusted query param used as the org filter | Only `SUPER_ADMIN` may supply `?orgId`; regular admins locked to `session.orgId`; added an explicit "Organization required" guard |

### Before / After examples

**R2 — proxy.ts hardcoded secret (fail-open → fail-closed)**

```ts
// BEFORE — forge a SUPER_ADMIN token if JWT_SECRET is ever unset
function getSecretKey() {
    const secret = (process.env.JWT_SECRET?.trim()) || "development-jwt-fallback-secret-keep-secure";
    return new TextEncoder().encode(secret);
}

// AFTER — shared module, no constant fallback (lib/session-secret.ts)
const raw = seed && seed.length > 0 ? seed : _randomHex(32); // random ⇒ tokens just fail ⇒ re-login
```

**R3 — refresh token expiry (7d → owned by Node layer at 2h)**

```ts
// BEFORE — proxy.ts re-signs a 7-day token that outlives the 2h logout blacklist
const newToken = await new SignJWT(userData)
    .setExpirationTime("7d")
    .sign(getSecretKey());

// AFTER — Edge middleware no longer re-signs; only the Node layer issues 2h tokens
//          (lib/auth.ts createSession ⇒ SESSION_DURATION = "2h")
return NextResponse.next({ request: { headers: requestHeaders } });
```

**R5 — candidate GET org isolation (post-fetch JS → DB WHERE clause)**

```ts
// BEFORE — leaks when candidateOrgId is null (orphaned drive)
const candidate = await prisma.application.findUnique({ where: { id }, select: { ... } });
const candidateOrgId = candidate.drive?.orgId || null;
if (session.role !== "SUPER_ADMIN" && session.orgId && candidateOrgId && candidateOrgId !== session.orgId) {
    return NextResponse.json({ error: "..." }, { status: 403 });
}

// AFTER — DB enforces it; no null short-circuit possible
const orgScope = session.role === "SUPER_ADMIN"
    ? { id }
    : { id, drive: { orgId: session.orgId ?? "__none__" } };
const candidate = await prisma.application.findFirst({ where: orgScope, select: { ... } });
```

**R6 / R7 / R8 — `?orgId` confused deputy (untrusted → SUPER_ADMIN-gated)**

```ts
// BEFORE — any admin can target any org
const orgId = searchParams.get("orgId") || session.orgId;

// AFTER — only SUPER_ADMIN may cross orgs; everyone else is pinned to their session
const orgId = session.role === "SUPER_ADMIN"
    ? (searchParams.get("orgId") || session.orgId)
    : session.orgId;
```

## Reviewed and confirmed already-safe (no change needed)

| Location | Why it's safe |
|----------|---------------|
| `app/api/candidates/route.ts` GET | Already gates `?orgId` behind `isSuperAdmin`; non-admins pinned to `session.orgId`. |
| `app/api/drives/route.ts` GET | `where.orgId` forced to `session.orgId` for non-SUPER_ADMIN (lines 54–59). |
| `app/api/admin/organization/route.ts`, `app/api/admin/credits/route.ts`, `app/api/admin/billing/history/route.ts` | All resolve `orgId` via `isSuperAdminRole(session.role) ? requested : session.orgId`. |
| `app/api/super-admin/**` | Reachable only by SUPER_ADMIN (middleware + per-route check); accepting `?orgId` is by design. |
| `lib/interview-access.ts` | `isInterviewTokenRequired()` is **fail-closed in production** (`NODE_ENV==="production"` ⇒ on unless explicitly set to `"false"`). Interview-token gaps are an env-flag, prod-default-secure choice. |
| Python agent (`interview/**`) | No new injection/deserialization surface; `SYNC_ENGINE_URL` SSRF requires control of a trusted env var. |

## Defense-in-depth recommendations (still open from prior audit)

These were flagged in the original audit and remain valid follow-ups (not addressed in this pass):

- Central `requireAuth(role)` wrapper for every `/api/admin/**` and object route, so org-scoping isn't re-implemented per handler.
- Authenticate the `stream/route.ts` SSE endpoint and the `resume-screening` upload routes (still open from prior audit).
- SSRF allowlist + private-range blocking in `extract/route.ts`.
- Replace `Math.random()` OTP generation with `crypto.randomInt`.
- Rotate any secrets previously committed to git history; require `JWT_SECRET` in every environment (now strictly required by the fail-closed change above to avoid forced re-logins).

## Verification

- `npx tsc --noEmit` — all changed files compile; the only remaining error is a pre-existing, unrelated type issue in `components/admin/candidate-profile/interview-report-v2.tsx`.
- Files changed this pass: `middleware.ts` (new), `lib/session-secret.ts` (new), `proxy.ts`, `lib/auth.ts`, `app/api/candidates/[id]/route.ts`, `app/api/candidates/route.ts`, `app/api/candidates/export/route.ts`.

---

# Full Remediation Pass — 2026-06-10 (round 2)

This round goes back through **every numbered section (§1–§10)** of this document and resolves the remaining actionable items. Each row maps to the original finding above. Items already fixed in an earlier pass (or neutralized in code before this audit was written) are marked **Already fixed / Verified**.

## §1 Authentication

| Finding | Status | Fix |
|---------|--------|-----|
| Middleware never runs | **Fixed** | Root `middleware.ts` created (round 1). |
| Dev fast-path skips revocation (`lib/auth.ts`) | **Fixed** | Removed the `NODE_ENV !== "production"` bypass in `verifySession`. Blacklist + password-change checks now run in **every** environment; latency is handled by the in-memory cache + a single batched `mget`, never by skipping the security check. |
| Hardcoded JWT fallback secret | **Fixed** | Removed (round 1); shared `lib/session-secret.ts` fails closed. |
| 7-day JWT, no rotation | **Fixed** | 2h tokens + rotating secret (round 1). |
| Login user-existence timing oracle | **Fixed** | `app/api/auth/login/route.ts` now runs a dummy `bcrypt.compare` against a constant hash when no user/password is found, equalizing response time. |

## §2 Authorization & Permissions

| Finding | Status | Fix |
|---------|--------|-----|
| `candidates/[id]` DELETE/PATCH client `orgId` | **Fixed** | Round 1: only SUPER_ADMIN may pass `?orgId`; others pinned to `session.orgId`. PATCH also now Zod-validated (see §7). |
| `candidates/export` cross-tenant CSV | **Fixed** | Round 1: SUPER_ADMIN-gated `?orgId` + explicit "Organization required". |
| `stream/route.ts` unauthenticated SSE PII leak | **Fixed** | Added `getSession()` (401 if absent) and scoped both queries to `drive.orgId = session.orgId`. SUPER_ADMIN / org-less sessions get a heartbeat-only stream. |
| `resume-screening` POST no auth | **Fixed** | Added admin/super-admin `getSession()` check + drive-org ownership verification before any upload/billing. |
| `resume-screening/candidates/[candidateId]` (PATCH/DELETE) no auth | **Fixed** | New shared `lib/drive-access.ts` `authorizeDriveAccess(driveId)` guard applied; enforces auth + tenant ownership of the drive. |
| `resume-screening/download` no auth | **Fixed** | Same `authorizeDriveAccess` guard applied before returning resume text. |
| `candidates/[id]/scan` no auth | **Verified safe** | Route is already disabled — returns `410 Gone` with no logic. No data path remains. |
| Voice preview TTS routes no auth | **Verified safe** | `app/api/admin/voice/preview/route.ts` + `sarvam` already call `getSession()` + role check (fixed before this audit row was written). |
| `extract` auth optional, orgId spoofable | **Fixed** | See §3 SSRF row — now requires a valid session and derives org from session (SUPER_ADMIN may target via field; others pinned). |
| No central authz layer | **Partially addressed** | Added reusable `authorizeDriveAccess`; a full `requireAuth(role)` wrapper across all routes remains a defense-in-depth follow-up. |

## §3 Security Vulnerabilities (OWASP)

| Finding | Status | Fix |
|---------|--------|-----|
| SSRF in `extract/route.ts` | **Fixed** | New `lib/safe-fetch.ts`: `assertPublicUrl()` rejects non-http(s) and any host resolving to loopback/private/link-local/CGNAT/metadata ranges (IPv4 + IPv6, incl. IPv4-mapped); `safeFetch()` sets `redirect:"manual"` (a 302 to an internal host can't bypass the check) + a 10s timeout. The scrape path now uses `safeFetch` and no longer logs the raw URL. |
| Weak crypto OTP (`Math.random()`) | **Fixed** | `forgot-password` and `otp/send` now use `crypto.randomInt(100000, 1000000)`. |
| IDOR `candidates/export` | **Fixed** | Round 1 (see §2). |
| Broken auth on interview token endpoints | **Fixed** | `isInterviewTokenRequired()` is now **fail-closed in all environments** (`!== "false"`), instead of only requiring the token when `NODE_ENV === "production"`. This closes `finalize` / `egress` / `proctoring` / `upload/interview-snapshot` in non-prod deploys at once. |
| Proctoring integrity injection | **Fixed (via above)** | With the token now required everywhere, the proctoring route's existing `accessToken !== interviewToken ⇒ 401` check is always enforced, so arbitrary `applicationId` event injection / row creation is blocked. |
| CSV injection in export | **Fixed** | `csvCell()` prefixes a `'` to any value starting with `= + - @ \t \r` and escapes quotes, neutralizing spreadsheet formula execution. |
| CSRF (sameSite lax, no tokens) | **Accepted (documented)** | Cookies are `sameSite: lax`, which blocks cross-site form POSTs for state-changing requests. Full CSRF tokens remain a defense-in-depth follow-up. |
| XSS `admin/layout.tsx:129` `dangerouslySetInnerHTML` | **Verified safe** | Content is a static CSS/theme string with no user input. |
| Exposed secrets in `.env` / git history | **Open (ops task)** | Requires secret rotation + history purge — operational, not a code change. Tracked in §"Still open". |

## §4 Caching

| Finding | Status | Fix |
|---------|--------|-----|
| Session cache auth-state staleness | **Fixed** | Revocation is now always consulted (see §1); the cache is a ≤5s latency aid only. |
| `candidates/[id]` PII cached `max-age=60` | **Fixed** | Changed to `Cache-Control: private, no-store`. |

## §5 Rate Limiting

| Finding | Status | Fix |
|---------|--------|-----|
| `verify-otp` no rate limit | **Fixed** | Added a fail-closed limiter (10 attempts / 10 min per email) → 429. |
| Rate limiter fails open | **Fixed** | `isRateLimited()` gained a `failClosed` param; `login`, `verify-otp`, `forgot-password`, `reset-password` now fail **closed** so a Redis outage can't open brute force. Non-auth flows keep failing open. |
| Thresholds too high (`2000`/`10000`/hr) | **Fixed** | `submissionLimiter` → 100/hr, `extractionLimiter` → 200/hr. |
| Rate-limit key = `x-forwarded-for` | **Open (infra)** | Trustworthiness of this header depends on the proxy config; flagged for the deployment layer. |

## §6 Session & Token

All items here are consequences of §1/§4 and are now resolved (no hardcoded secret, revocation always consulted, 2h tokens). LiveKit token issuance is tied to the interview access token, which is now always required (§3).

## §7 Data Validation

| Finding | Status | Fix |
|---------|--------|-----|
| `candidates/[id]` PATCH mass-assignment | **Fixed** | New `updateCandidateStatusSchema` (`.strict()`, value length caps) validates the body before any DB write. |
| `candidates/export` CSV injection | **Fixed** | See §3. |

## §8–§10

| Finding | Status | Notes |
|---------|--------|-------|
| Full `error` objects logged | **Open (low)** | Central redacting logger is a follow-up; no secret/PII is logged in the routes touched this pass (raw scrape URL log removed). |
| DB TLS `require` not `verify-full` (§9) | **Open (infra)** | Connection-string / cert change at the deploy layer. |
| `$executeRawUnsafe` sites (§9) | **Verified safe** | All use bound `$1,$2` params — no SQLi. |
| Concurrency / billing (§10) | **Unchanged** | Out of scope for this security pass; needs runtime verification as previously noted. |

## New / changed files (round 2)

`lib/safe-fetch.ts` (new), `lib/drive-access.ts` (new),
`lib/interview-access.ts`, `lib/auth.ts`, `lib/rate-limit.ts`, `lib/validation.ts`,
`app/api/stream/route.ts`, `app/api/extract/route.ts`,
`app/api/candidates/[id]/route.ts`, `app/api/candidates/export/route.ts`,
`app/api/drives/[id]/resume-screening/route.ts`,
`app/api/drives/[id]/resume-screening/candidates/[candidateId]/route.ts`,
`app/api/drives/[id]/resume-screening/download/route.ts`,
`app/api/auth/login/route.ts`, `app/api/auth/verify-otp/route.ts`,
`app/api/auth/forgot-password/route.ts`, `app/api/auth/otp/send/route.ts`,
`app/api/auth/reset-password/route.ts`.

## Still open (not code — operational / infra)

1. **Rotate exposed secrets** (LiveKit key/secret, Redis password; review OpenAI/Resend/Pinecone) and purge git history. Require `JWT_SECRET` in every environment.
2. **DB TLS `verify-full`** with a pinned CA in production.
3. **Trusted client IP** for rate-limit keys (don't trust raw `x-forwarded-for` at the edge).
4. **Central `requireAuth(role)` wrapper** + standardized Zod validation across all remaining routes (defense-in-depth).
5. **Redacting logger** for production error logs.
6. **CSRF tokens** on mutating routes (currently relying on `sameSite: lax`).

> **Behavioral note:** revocation is now checked in all environments, so local dev needs Redis reachable for sessions to validate (it already is, via the lazy-connect client). `JWT_SECRET` is now strictly required everywhere — without it, each process seeds a random secret and existing sessions won't validate after a restart (fail-closed by design).

---

# Fresh CTO Audit — 2026-06-10 (independent full sweep)

This pass independently re-verified **all 71 API routes**, the middleware matcher, every raw-SQL site, the file-upload and webhook surfaces, the LiveKit/interview-token boundary, secrets, and the worker integration — without assuming prior passes were complete. Methodology: built an auth-posture matrix for every route (session? role? token?), then manually traced each `----` (unguarded) route and every `searchParams.get("orgId")` / raw-SQL / `fetch()` / `spawn()` site to a concrete attack path.

## New findings fixed this pass

| # | Severity | Location | Vulnerability | Attack path | Fix |
|---|----------|----------|---------------|-------------|-----|
| C1 | **Critical** | `scripts/deploy-superadmin.ts`, `scripts/bootstrap_new_account.ts` | Hardcoded super-admin/admin password `"sreevaai@123"` committed to source; scripts create the live `support@sreevaai.com` SUPER_ADMIN + ORG_ADMIN with it | Anyone reading the repo logs in as super-admin if either script was run against prod and the password wasn't manually rotated → full platform + all-tenant takeover | Password now read from `SUPERADMIN_PASSWORD` env var (min 12 chars), **fail-closed** if absent; no credential printed |
| H1 | **High** | `app/api/extract/status/[jobId]/route.ts` | IDOR — returned extracted JD/resume `data`+`text` for any `jobId` with **no ownership check**; session was used only for billing. BullMQ assigns **sequential integer** job IDs (`removeOnComplete: {count:10}`), so the last 10 extractions across all orgs were enumerable | Unauthenticated/any-org caller requests `/api/extract/status/1..N` and reads other tenants' job descriptions and candidate resume text | Now requires a session and verifies `job.data.orgId === session.orgId` (SUPER_ADMIN exempt) before returning anything; mismatches return not-found without revealing existence |
| M1 | **Medium** | `app/api/admin/candidates/[id]/sync/route.ts` | Internal auth used a **non-constant-time** `===` on a secret **and fell back to `JWT_SECRET`** — anyone who learned the JWT signing key could bypass the route's auth, and the compare leaked the secret by timing | Timing side-channel on the header; or JWT-secret reuse as an API bypass token | Switched to `crypto.timingSafeEqual`; removed the `JWT_SECRET` fallback (dedicated `WORKER_SYNC_TOKEN` only). Verified the worker calls `syncCandidateCorpusToPinecone()` directly — the HTTP path is unused, so no flow breaks |

## Verified SAFE (independently traced — no change needed)

| Area | Why it holds |
|------|--------------|
| **Middleware coverage** | Root `middleware.ts` now active; gates `/admin`, `/super-admin`, `/api/super-admin`. `/api/admin/**` is *not* middleware-gated but every such route enforces `getSession()` + org scope in-handler (verified across all 18). |
| **Tenant isolation (orgId)** | Every `searchParams.get("orgId")` site re-checked: `candidates` (GET/DELETE/PATCH/export), `drives`, `admin/organization`, `admin/credits`, `admin/billing/history`, `bulk-action`, `bulk-email`, `admin/chat`, `admin/integrity`, `score-distribution` all derive org from `session.orgId` and only allow `?orgId` override for SUPER_ADMIN. |
| **SQL injection** | All `$executeRawUnsafe`/`$queryRawUnsafe` sites (`score-distribution`, `egress`, `finalize`, `proctoring`, `worker.ts`) use bound `$1,$2` params — **zero** string interpolation of user input. |
| **Interview token boundary** | `[id]/token`, `egress`, `finalize`, `proctoring`, `verify-speech`, `upload/interview-snapshot` all gate on the per-application `accessToken` (a 122-bit `crypto.randomUUID`), now fail-closed via `isInterviewTokenRequired()`. Token is bound to the `applicationId`, so no cross-interview IDOR. |
| **Command injection** | `worker.ts` `spawn(pythonCmd, [args])` uses the array form (no shell); args are server-generated temp paths / fixed strings. |
| **Code execution / deserialization** | No `eval`/`new Function`; the only `dangerouslySetInnerHTML` (`admin/layout.tsx`) is a static CSS string. No `pickle`/`yaml.load` on user input (Python side). |
| **Privilege escalation** | `super-admin/orgs/[id]/reset-password` requires SUPER_ADMIN **and** re-verifies the super-admin's own password, then invalidates the target's sessions. LiveKit grants are room-scoped to `interview_<applicationId>`. |
| **Disabled endpoints** | `candidates/[id]/scan`, `admin/candidates/[id]/rescan`, `interview/recording`, `interview/start-recording`, `webhooks/livekit` are inert stubs (410 / no-op). |
| **Candidate self-service** | `candidates/status` scopes to `session.email`; returns only the caller's own applications + their own interview tokens. |
| **File upload** | `upload/presigned` fixes the bucket, sanitizes the filename, gates JD uploads behind admin and resume uploads behind an active-drive check; presigned URL is write-scoped to one key. |

## Still open (operational / infra — not code)

Unchanged from the prior pass and re-confirmed: rotate any secrets in git history (now including the formerly-hardcoded bootstrap password — **rotate `support@sreevaai.com` immediately if either script ever ran in prod**); DB TLS `verify-full`; trusted client IP for rate-limit keys; central `requireAuth(role)` wrapper; redacting prod logger; CSRF tokens on mutating routes.

## Verification

`npx tsc --noEmit` — all changed files compile. The only remaining type errors are pre-existing and unrelated (`interview-report-v2.tsx`, `worker.ts` `dotenv`), plus stale Next.js generated route-validator stubs in `.next`/`nextjs-dev-cache` that regenerate on build. Files changed this pass: `app/api/extract/status/[jobId]/route.ts`, `app/api/admin/candidates/[id]/sync/route.ts`, `scripts/deploy-superadmin.ts`, `scripts/bootstrap_new_account.ts`.