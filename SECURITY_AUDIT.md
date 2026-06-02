# Security Audit Report — HR Interview Platform

**Date:** 2026-06-02
**Stack:** Next.js (App Router) + Python/LiveKit agent + PostgreSQL (Prisma) + Redis + R2/S3
**Auditor:** Internal security review
**Status:** Pre-production. **Not safe to expose to real users yet.**

> **How to read this:** Severity goes Critical → High → Medium → Low.
> Each issue has a plain-English explanation and the exact file/line.
> "UNKNOWN RISK" = needs runtime verification I couldn't do (Docker/app not runnable in the audit environment).

---

## Executive Risk Summary

| Area | Risk Level | Summary | Impact |
|------|-----------|---------|--------|
| Authentication | **Critical** | Auth middleware (`proxy.ts`) is **not registered** — Next.js only runs a file named `middleware.ts`. Build manifest shows zero middleware. | All route-level gating is dead code; protection relies on inconsistent per-route checks. |
| Authorization | **Critical** | Many routes check only `if (!session)` with no role/org enforcement; `orgId` taken from client query params. | IDOR + privilege escalation: any logged-in user (incl. CANDIDATE) can read/delete/modify candidate records. |
| OWASP: SSRF | **High** | `app/api/extract/route.ts` does `fetch(userUrl)` unauthenticated, no allowlist, route excluded from middleware. | Reaches cloud metadata (169.254.169.254), internal Redis/Postgres, internal services. |
| OWASP: Weak crypto | **High** | OTPs generated with `Math.random()` (non-CSPRNG), 6 digits. | Predictable/brute-forceable admin password-reset codes. |
| Rate limiting | **High** | `verify-otp` has no rate limit; limiter **fails open**; keyed on spoofable `x-forwarded-for`. | OTP brute force, distributed login abuse, limiter bypass. |
| Session management | **High** | In-memory session cache returns user without revocation check for 5s; dev fast-path skips all revocation; hardcoded JWT dev fallback secret. | Revoked/blacklisted sessions briefly valid; weak secret if NODE_ENV misset. |
| API security | **High** | Several unauthenticated mutation endpoints gated only by `INTERVIEW_TOKEN_REQUIRED`, which is off outside production. | Forged interview results / data tampering if env misconfigured. |
| Secrets exposure | **High** | Real LiveKit/Redis/OpenAI/Resend/Pinecone keys in `.env`; `livekit.yaml`/`egress.yaml` carried them in git history. | Credentials in git history must be rotated. |
| Data validation | **Medium** | Inconsistent — some routes use Zod (`finalize`), many parse `request.json()` with no schema. | Type confusion, mass-assignment on PATCH. |
| Caching | **Medium** | `GET /api/candidates/[id]` sets `Cache-Control: private, max-age=60` on PII; session cache correctness risk. | Stale authz; PII cached in intermediaries. |
| Logging | **Medium** | OTP values not logged (good), but full error objects and scraped URLs logged; no central redaction. | Possible PII/stack leakage to logs. |
| DB security | **Medium** | Raw SQL is parameterized (no SQLi found ✅) but `$executeRawUnsafe` used widely; DB SSL `require` not `verify-full`. | MITM risk on DB TLS; fragile pattern. |
| Concurrency | **Medium** | Module-global mutable session cache shared across requests; minor rate-limit window race; billing dedup relies on app logic. | Cross-request cache bleed under load; double-billing edge. |

**Overall Risk Score: 78 / 100 (High).**
**Production-ready: NO.**

---

## 1. Authentication

| File | Issue | Severity | Explanation | Fix |
|------|-------|----------|-------------|-----|
| `proxy.ts` + missing `middleware.ts` | **Middleware never runs** | **Critical** | Next.js only executes middleware from root `middleware.ts`/`.js`. This file is `proxy.ts` exporting `proxy`. `.next/server/middleware-manifest.json` → `middleware: []`. Every redirect/role gate here is dead. | Create root `middleware.ts` re-exporting `proxy as middleware` + its `config`. Re-test all route protections. |
| `lib/auth.ts:90-95` | **Dev fast-path skips revocation** | High | When `NODE_ENV !== "production"`, blacklist + pwd-change checks are skipped entirely. If a prod deploy ever runs without `NODE_ENV=production`, logout/blacklist is a no-op. | Make revocation checks unconditional; gate only the latency optimization, never the security check. |
| `lib/auth.ts:6-16` | **Hardcoded dev JWT fallback secret** | Medium | `"development-jwt-fallback-secret-keep-secure"` used if `JWT_SECRET` unset and not prod. | Require `JWT_SECRET` always; fail closed in all envs. |
| `lib/auth.ts:53-58` | **7-day JWT, no rotation, no jti** | Medium | Long-lived stateless tokens; revocation only via Redis blacklist that the dev path and 5s cache can bypass. | Shorten TTL, add `jti`, ensure blacklist always consulted. |
| `app/api/auth/login/route.ts:90` | User-existence timing oracle | Low | bcrypt only runs for existing users; non-existent users skip it → timing reveals valid emails. | Always run a dummy bcrypt compare for unknown users. |

---

## 2. Authorization & Permissions

| File | Issue | Severity | Explanation | Fix |
|------|-------|----------|-------------|-----|
| `app/api/candidates/[id]/route.ts` (DELETE/PATCH) | **No role check; client-supplied `orgId`** | **Critical** | `orgId = searchParams.get("orgId") || session.orgId`. Only `if (!session)` gates it — a CANDIDATE-role session can delete/modify candidates. | Enforce admin role; derive orgId from session only, never query. |
| `app/api/drives/[id]/resume-screening/route.ts` (POST) | **No authentication at all** | **Critical** | Takes `driveId` from URL and uploads/queues resumes with no session check. Anyone can upload to any drive. | Add admin auth + verify drive belongs to caller's org. |
| `app/api/drives/[id]/resume-screening/candidates/[candidateId]/route.ts` | No auth | High | No session check on candidate-level screening route. | Add auth + org ownership check. |
| `app/api/drives/[id]/resume-screening/download/route.ts` | No auth | High | Downloadable screening data with no session check. | Add auth + org ownership check. |
| `app/api/candidates/[id]/scan/route.ts` | No auth | High | No session reference in file. | Add admin auth. |
| All `app/api/admin/**` & `/api/super-admin/**` | **Rely on dead middleware** | **Critical** | Since middleware doesn't run, these are only as protected as their own code; many only check `if (!session)`. | Add explicit role check at top of every handler. |
| `app/api/extract/route.ts:56-63` | Auth optional, orgId spoofable | High | `getSession()` wrapped in try/catch that swallows failure; `orgId` from `explicitOrgId` form field. | Require valid session; ignore client orgId. |
| Pattern (~16 routes) | **No central authz layer** | High | Each route re-implements (or forgets) checks. 28 of 71 routes have no `getSession` reference. | Introduce one `requireAuth(role)` wrapper used by every protected route. |

---

## 3. Security Vulnerabilities (OWASP)

| Type | Location | Severity | Explanation | Fix |
|------|----------|----------|-------------|-----|
| **SSRF** | `app/api/extract/route.ts:85` | **High** | `fetch(url)` on raw user input, unauthenticated, no allowlist, route excluded from middleware matcher (`proxy.ts:97`). Reaches `169.254.169.254`, `localhost:6379`, internal hosts. | Require auth; enforce https; resolve DNS and block private/link-local ranges; disable redirects; timeout + size cap. |
| **Weak crypto** | `forgot-password/route.ts:48`, `otp/send/route.ts:38` | **High** | `Math.floor(100000 + Math.random()*900000)` — `Math.random()` is not a CSPRNG; 6-digit space. | Use `crypto.randomInt(100000, 1000000)`; add lockout. |
| **IDOR** | `candidates/[id]`, resume-screening candidate routes | **High** | Object access scoped by client-supplied orgId or not at all. | Server-derived org scoping + ownership check on every object route. |
| **Broken auth** | `interview/finalize`, `egress`, `proctoring`, `upload/interview-snapshot` | High | Gated only by `isInterviewTokenRequired()` which returns false when `NODE_ENV !== production` (`lib/interview-access.ts:5`). | Always require the interview access token regardless of env. |
| **CSRF** | All cookie-auth POST routes | Medium | Session cookie is `sameSite: lax` (helps) but no CSRF tokens. | Add CSRF tokens or `sameSite: strict` for mutating routes. |
| **XSS** | `app/admin/layout.tsx:129` | Low | `dangerouslySetInnerHTML` but content appears static (CSS). | Confirm static; if dynamic, sanitize. |
| **Exposed secrets** | `.env`, deleted `livekit.yaml`/`egress.yaml` | High | Real keys present; secrets were committed in YAML now in git history. | Rotate LiveKit key/secret, Redis password; review OpenAI/Resend/Pinecone. Purge history if feasible. |
| **Insecure deserialization** | — | None found | JSON.parse on bounded inputs. | — (safe) |
| **SQL injection** | All `$executeRawUnsafe`/`$queryRaw` sites | **None found ✅** | Every raw site uses `$1,$2` bound params (finalize, recording, worker). | Keep parameterized; prefer Prisma query builder where possible. |

---

## 4. Caching Layer

| Component | Issue | Risk | Explanation | Fix |
|-----------|-------|------|-------------|-----|
| `lib/auth.ts:65-95` session cache | **Auth-state staleness** | High | Module-global `Map<token, user>` flushed every 5s. Once cached, blacklist/pwd-change is NOT re-checked for up to 5s; dev path never checks. Map is process-global → shared across requests. | Scope cache per-request; always re-check revocation. |
| `app/api/candidates/[id]/route.ts:94` | **PII cached** | Medium | `Cache-Control: private, max-age=60` on full candidate PII (email, phone, resume, scores). | Use `no-store` for PII. |
| `super-admin/exchange-rate/route.ts` | `public, s-maxage=3600` | Low | Public non-sensitive data — acceptable (note: reachable without auth). | OK. |

---

## 5. Rate Limiting & Abuse Protection

| Endpoint | Issue | Severity | Explanation | Fix |
|----------|-------|----------|-------------|-----|
| `auth/verify-otp` | **No rate limit at all** | **High** | OTP brute-forceable; combined with `Math.random()` 6-digit codes → realistic account takeover. | Strict per-email + per-IP limit and attempt counter that invalidates the OTP after N failures. |
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
| Many routes | No schema on `request.json()` | Medium | `finalize` uses Zod (good); most don't. | Standardize Zod validation. |
| `extract/route.ts` | Trusts `content-length` | Low | 20MB cap + type allowlist ✅, but header is spoofable. | Also cap actual stream size. |

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
| `lib/auth.ts` `_sessionCache` | Process-global mutable map | High | Shared across all concurrent requests; correctness + revocation-staleness window. | Per-request scope. |
| `lib/rate-limit.ts` | Window race | Low-Med | zadd then zcard not atomic against concurrent callers near the boundary; minor over-allow. | Acceptable, or use Lua script for atomic count+limit. |
| `interview/finalize` billing | Double-billing guard in app logic | Medium (UNKNOWN) | Comments claim atomic "mark-and-deduct" via billingSnapshot; needs verification under concurrent finalize + agent completion. | Verify with DB-level conditional update / unique constraint. |
| `lib/prisma.ts` pool `max: 3` | Low pool under load | Low | May serialize/timeout under burst (reliability, not security). | Tune for expected concurrency. |

---

## Top 10 Critical Fixes Before Production

1. **Wire up middleware** — create root `middleware.ts`; verify manifest lists it and all gates fire.
2. **Central `requireAuth(role)` wrapper** applied to every `/api/admin/**`, `/api/super-admin/**`, and object route.
3. **Fix IDOR in `candidates/[id]`** (and siblings): derive `orgId` from session only; require admin role for DELETE/PATCH.
4. **Authenticate `resume-screening` upload routes** (currently fully open).
5. **SSRF in `extract`**: require auth + URL allowlist/private-range blocking + redirect/timeout/size limits.
6. **OTP crypto**: replace `Math.random()` with `crypto.randomInt`; add rate limit + attempt lockout to `verify-otp`.
7. **Revocation correctness**: remove dev fast-path bypass; always consult blacklist/pwd-change; scope session cache per-request.
8. **Interview token mandatory**: make `isInterviewTokenRequired()` always true; protect `finalize`/`egress`/`proctoring`/snapshot upload.
9. **Rate limiter fail-closed** for auth flows; key on trusted IP/identity, not `x-forwarded-for`; set realistic limits.
10. **Rotate exposed secrets** (LiveKit key/secret, Redis password; review OpenAI/Resend/Pinecone) and require `JWT_SECRET` in all envs.

---

## Audit Coverage & Caveats

**Covered in depth:** `lib/auth.ts`, `lib/rate-limit.ts`, `lib/redis.ts`, `lib/prisma.ts`, `proxy.ts`, the build middleware manifest, and the auth-critical API routes; raw-SQL sites in `worker.ts` and interview routes; `.env`/secret posture.

**Not exhaustively line-read (recommended follow-up):**
- The Python agent/worker side (`interview/`, `behavioral_analysis.py`, `agent.py`) and the resume-extraction subprocess.
- Every one of the 71 API routes individually (sampled the highest-risk ones).

**Could not run dynamically:** Docker/`docker compose` and the app were not runnable in the audit environment, so all findings are from static analysis. Items marked **UNKNOWN RISK** need runtime verification.
