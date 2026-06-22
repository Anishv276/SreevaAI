# Soft-Delete Filtering Audit Report

**Date:** June 22, 2026  
**Status:** CRITICAL ISSUES FOUND  
**Severity:** HIGH

---

## Executive Summary

The codebase has a **global Prisma middleware** that automatically applies soft-delete filtering (`isDeleted: false`) to all ORM operations. However, **raw SQL queries using `prisma.$queryRaw()` BYPASS this middleware and must manually include `isDeleted` filters**.

**Finding:** Multiple critical API endpoints use raw SQL queries that **do NOT filter deleted records**, causing:
- Deleted organizations to be counted in statistics
- Deleted drives/applications/interviews to appear in dashboards
- Inflated billing/credit calculations
- Data integrity issues across admin and super-admin interfaces

---

## Soft-Delete Models

The following models have an `isDeleted` field:
- `Organization`
- `User`
- `Drive`
- `Application`
- `Interview`
- `SuperAdmin`
- `SupportTicket`
- `EngineVoice`

---

## Middleware Architecture

**Location:** `lib/prisma.ts`

The Prisma client middleware automatically applies `where: { isDeleted: false }` to:
- `findMany()`
- `findFirst()`
- `findFirstOrThrow()`
- `findUnique()` (converted to `findFirst()`)
- `findUniqueOrThrow()` (converted to `findFirstOrThrow()`)
- `count()`
- `aggregate()`

**LIMITATION:** Raw SQL queries (`prisma.$queryRaw()` and `prisma.$queryRawUnsafe()`) are NOT filtered by the middleware and must include soft-delete checks manually.

---

## Critical Issues — Raw SQL Without Soft-Delete Filters

### 1. **app/api/super-admin/stats/route.ts** — HIGH SEVERITY

**File:** `app/api/super-admin/stats/route.ts`

**Issues:**

| Line | Query | Tables | Filter Status | Problem |
|------|-------|--------|---|---------|
| 52 | COUNT FROM "Drive" | Drive | ❌ MISSING | Counts deleted drives |
| 53 | COUNT FROM "Application" | Application | ❌ MISSING | Counts deleted applications |
| 62-63 | SELECT FROM "Organization" | Organization | ❌ MISSING | Includes deleted orgs in stats |
| 65-69 | SELECT FROM "Organization" (credits) | Organization | ❌ MISSING | Deleted org credits included |
| 71-73 | SUM("creditsUsed") FROM "Organization" | Organization | ❌ MISSING | Total credits miscalculated |
| 75-83 | JOIN Organization → Drive → Application → Interview | All 4 | ❌ MISSING | Deleted records in interview top orgs |
| 85-91 | COUNT interview totals | All 4 | ❌ MISSING | Deleted interviews counted |
| 101-140 | Recent activity query (UNION) | Organization, Drive, Application, Interview | ❌ MISSING | Deleted items in activity feed |
| 152-159 | Trends query | Organization, Drive, Application | ❌ MISSING | Deleted records skew trends |

**Impact:**
- Super-admin dashboard shows inflated statistics
- Deleted organizations counted in "Total Orgs"
- Deleted drives/applications/interviews in charts
- Recent activity feed shows deleted items
- Trend analysis is inaccurate

**Fix Required:**
```sql
WHERE "isDeleted" = false
```

---

### 2. **app/api/admin/stats/route.ts** — HIGH SEVERITY

**File:** `app/api/admin/stats/route.ts`

**Issues:**

| Line | Query | Tables | Filter Status | Problem |
|------|-------|--------|---|---------|
| 37-55 | SELECT FROM "Application" JOIN "Drive" | Application, Drive, Interview | ❌ MISSING | Missing isDeleted filters on all tables |
| 56-61 | SELECT FROM "Drive" | Drive | ❌ MISSING | Counts deleted drives |

**Impact:**
- Organization admin dashboard shows deleted applications
- Interview counts include deleted interviews
- Statistics are inflated

**Fix Required:**
```sql
WHERE a."isDeleted" = false 
  AND d."isDeleted" = false 
  AND i."isDeleted" = false
```

---

### 3. **app/api/super-admin/orgs/route.ts** — HIGH SEVERITY

**File:** `app/api/super-admin/orgs/route.ts`

**Issues:**

| Line | Query | Tables | Filter Status | Problem |
|------|-------|--------|---|---------|
| 50-79 | SELECT FROM "Organization" with subcounts | User, Drive, Application, Interview | ❌ PARTIAL | Organization has middleware filter, but subcounts don't |
| 99-119 | Counts query | User, Drive, Application, Interview | ❌ MISSING | No filters on subcounts |
| 120-127 | Credit stats | Organization | ❌ MISSING | Deleted org credits included |
| 128-137 | Interview stats | Organization, Drive, Application, Interview | ❌ MISSING | All 4 tables unfiltered |
| 138-177 | Recent activity (UNION) | Organization, Drive, Application, Interview | ❌ MISSING | Activity feed shows deleted items |
| 178-197 | Trends query | Organization, User, Drive, Application | ❌ MISSING | Deleted records skew trends |

**Impact:**
- Organization listing shows deleted subcounts
- Trends show inflated numbers
- Activity feed displays deleted items
- Credit calculations include deleted orgs

**Fix Required:**
Add `WHERE ... AND X."isDeleted" = false` to all subqueries and JOINs.

---

### 4. **lib/credits.ts** — HIGH SEVERITY

**File:** `lib/credits.ts`

**Issues:**

| Line | Function | Query | Filter Status | Problem |
|------|----------|-------|---|---------|
| 40-54 | `getOrgBillingStatus()` | SELECT FROM "Organization" | ❌ MISSING | Deleted org billing retrieved |
| 71-83 | `syncOrgStatusWithInterviewQuota()` | SELECT FROM "Organization" | ❌ MISSING | Sync includes deleted orgs |
| 124-135 | `getEffectiveOrgStatus()` | SELECT FROM "Organization" | ❌ MISSING | Status check includes deleted |

**Impact:**
- Billing status returned for deleted organizations
- Quota sync processes deleted orgs
- Status checks don't respect soft deletes
- Could allow re-activation of deleted orgs

**Fix Required:**
```sql
WHERE id = ${orgId} AND "isDeleted" = false
```

---

### 5. **app/api/admin/organization/route.ts** — HIGH SEVERITY

**File:** `app/api/admin/organization/route.ts`

**Issues:**
- Raw SQL query selects from "Organization" with Drive/Interview subcounts
- No `isDeleted` filters on Drive or Interview counts

**Impact:**
- Organization admin page shows deleted drive/interview counts

**Fix Required:**
```sql
WHERE "isDeleted" = false
```

---

### 6. **app/api/super-admin/orgs/interview-history/route.ts** — MEDIUM SEVERITY

**File:** `app/api/super-admin/orgs/interview-history/route.ts`

**Issues:**
- Interview/Application/Drive queries without soft-delete filters

**Impact:**
- Interview history includes deleted records

---

### 7. **app/api/admin/score-distribution/route.ts** — MEDIUM SEVERITY

**File:** `app/api/admin/score-distribution/route.ts`

**Issues:**
- Interview/Application/Drive queries without soft-delete filters

**Impact:**
- Score distribution charts include deleted applications/interviews

---

## Correct Implementations (Using Prisma ORM)

The following correctly use Prisma ORM and benefit from automatic soft-delete filtering:

✅ `worker.ts` — All application/interview/user queries use Prisma ORM  
✅ All `findMany()`, `findUnique()`, `findFirst()` calls throughout the codebase  
✅ `prisma.organization.count()` — automatic filtering  
✅ `prisma.user.findMany()` — automatic filtering  

---

## Verification Points

### ✓ Soft-Delete Correctly Applied

- Line 51 in `app/api/super-admin/stats/route.ts`: `WHERE "isDeleted" = false` for SuperAdmin ✓
- Prisma middleware for Organization count (line 39) ✓
- All ORM-based queries automatically filtered ✓

### ✗ Soft-Delete Missing

- Lines 52-160: Raw SQL for Drive, Application, Interview without filters ✗
- Lines 99-197 in orgs/route.ts: Subcounts without filters ✗
- All three functions in credits.ts: Organization queries without filters ✗

---

## Remediation Steps

### Priority 1: Super-Admin Stats (CRITICAL)

**File:** `app/api/super-admin/stats/route.ts`

1. **Line 52:** Add `WHERE "isDeleted" = false` to Drive count
2. **Line 53:** Add `WHERE "isDeleted" = false` to Application count
3. **Lines 62-63:** Add filter to Organization query
4. **Lines 65-73:** Add filter to Organization credit queries
5. **Lines 75-91:** Add `WHERE` conditions to interview/drive/application/organization joins
6. **Lines 101-140:** Add soft-delete checks to all UNION subqueries
7. **Lines 152-159:** Add filters to organization/drive/application/interview queries

### Priority 2: Admin Stats

**File:** `app/api/admin/stats/route.ts`

1. **Lines 37-55:** Add `a."isDeleted" = false AND d."isDeleted" = false AND i."isDeleted" = false`
2. **Lines 56-61:** Add `d."isDeleted" = false AND i."isDeleted" = false`

### Priority 3: Org Management

**File:** `app/api/super-admin/orgs/route.ts`

1. **Lines 50-79:** Add filters to all subqueries (User, Drive, Application, Interview)
2. **Lines 99-119:** Add filters to count subcounts
3. **Lines 120-197:** Add filters to all activity/stats/trends queries

### Priority 4: Credits Module

**File:** `lib/credits.ts`

1. **Lines 45-52:** Add `AND "isDeleted" = false` to WHERE clause
2. **Lines 78-82:** Add `AND "isDeleted" = false` to WHERE clause
3. **Lines 130-134:** Add `AND "isDeleted" = false` to WHERE clause

### Priority 5: Other Endpoints

**Files to check:**
- `app/api/admin/organization/route.ts`
- `app/api/super-admin/orgs/interview-history/route.ts`
- `app/api/admin/score-distribution/route.ts`

---

## Testing Strategy

After fixes:

1. **Unit Tests:** Verify queries with deleted records return empty results
2. **Integration Tests:** Confirm stats don't count deleted organizations
3. **Dashboard Tests:** Verify admin dashboards exclude deleted items
4. **Billing Tests:** Ensure credits/quota calculations don't include deleted orgs

### Example Test Case
```typescript
// Create org, delete it, verify it's not in stats
const org = await prisma.organization.create({...});
await prisma.organization.update({
  where: { id: org.id },
  data: { isDeleted: true }
});
const stats = await GET(); // Stats should not count this org
```

---

## Code Pattern: Correct Implementation

### ✓ ORM (Automatic)
```typescript
// Automatically filtered by middleware
const orgs = await prisma.organization.findMany();
const count = await prisma.organization.count();
```

### ✓ Raw SQL (Manual Filter Required)
```typescript
// Must add WHERE clause manually
const orgs = await prisma.$queryRaw`
  SELECT * FROM "Organization"
  WHERE "isDeleted" = false
`;
```

### ✗ Raw SQL (WRONG - Deleted records included)
```typescript
// MISSING filter — deleted orgs included
const orgs = await prisma.$queryRaw`
  SELECT * FROM "Organization"
`;
```

---

## Prevention Going Forward

1. **Linting Rule:** Add ESLint rule to flag raw SQL queries on soft-delete models without `isDeleted` check
2. **Code Review:** Require explicit approval for all raw SQL queries
3. **Documentation:** Update CLAUDE.md with soft-delete pattern rules
4. **Test Coverage:** Add tests that verify soft-delete filtering for all queries

---

## Estimated Impact

- **Scope:** 7 API endpoints, 1 utility module
- **Lines Affected:** ~200 lines of SQL queries
- **Models Affected:** Organization, User, Drive, Application, Interview
- **Dashboards Affected:** 3 (super-admin stats, org stats, admin stats)
- **Severity:** HIGH — Affects data integrity, billing, and security

---

## Summary Table

| File | Lines | Tables | Status | Fix Type |
|------|-------|--------|--------|----------|
| `app/api/super-admin/stats/route.ts` | 52-159 | 4+ | 🔴 CRITICAL | Add WHERE filters |
| `app/api/admin/stats/route.ts` | 37-61 | 3+ | 🔴 CRITICAL | Add WHERE filters |
| `app/api/super-admin/orgs/route.ts` | 50-197 | 4+ | 🔴 CRITICAL | Add WHERE filters |
| `lib/credits.ts` | 40-135 | 1 | 🔴 CRITICAL | Add WHERE filters |
| `app/api/admin/organization/route.ts` | 30-68 | 2+ | 🟠 HIGH | Add WHERE filters |
| `app/api/super-admin/orgs/interview-history/route.ts` | TBD | 3+ | 🟠 HIGH | Add WHERE filters |
| `app/api/admin/score-distribution/route.ts` | TBD | 3+ | 🟠 HIGH | Add WHERE filters |

---

## Related Files

- **Middleware:** `lib/prisma.ts` — Global soft-delete filtering
- **Schema:** `prisma/schema.prisma` — Model definitions with `isDeleted` fields
- **Documentation:** `CLAUDE.md` — Architecture guide

---

## Next Steps

1. ✅ Review this audit report
2. ⏳ Prioritize fixes (start with Priority 1-2)
3. ⏳ Implement WHERE clause additions
4. ⏳ Add test cases to verify filtering
5. ⏳ Add linting rules to prevent future issues
6. ⏳ Update CLAUDE.md with soft-delete patterns
