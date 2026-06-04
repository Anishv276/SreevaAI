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