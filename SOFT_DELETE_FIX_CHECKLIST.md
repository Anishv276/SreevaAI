# Soft-Delete Filtering — Fix Checklist

## Overview

Global Prisma middleware auto-filters ORM queries, but **raw SQL queries must manually add `isDeleted` filters**.

```
✓ Prisma ORM (findMany, findUnique, count, etc.)  → Auto-filtered
✗ Raw SQL ($queryRaw)                              → Manual filter required
```

---

## Files Requiring Fixes (Priority Order)

### 🔴 PRIORITY 1: Super-Admin Stats Dashboard

**File:** `app/api/super-admin/stats/route.ts`

- [ ] **Line 52:** Drive count
  ```diff
  - (SELECT COUNT(*)::INT FROM "Drive") AS "totalDrives",
  + (SELECT COUNT(*)::INT FROM "Drive" WHERE "isDeleted" = false) AS "totalDrives",
  ```

- [ ] **Line 53:** Application count
  ```diff
  - (SELECT COUNT(*)::INT FROM "Application") AS "totalCandidates",
  + (SELECT COUNT(*)::INT FROM "Application" WHERE "isDeleted" = false) AS "totalCandidates",
  ```

- [ ] **Line 54:** Shortlisted filter
  ```diff
  - (SELECT COUNT(*)::INT FROM "Application" WHERE UPPER("resumeStatus") = 'SHORTLISTED') AS "totalShortlisted",
  + (SELECT COUNT(*)::INT FROM "Application" WHERE "isDeleted" = false AND UPPER("resumeStatus") = 'SHORTLISTED') AS "totalShortlisted",
  ```

- [ ] **Line 55:** Interview filter
  ```diff
  - (SELECT COUNT(*)::INT FROM "Interview" WHERE "status" = 'COMPLETED') AS "totalInterviewed",
  + (SELECT COUNT(*)::INT FROM "Interview" WHERE "isDeleted" = false AND "status" = 'COMPLETED') AS "totalInterviewed",
  ```

- [ ] **Lines 59, 62-63:** Organization queries
  ```diff
  - FROM "Organization"
  + FROM "Organization" WHERE "isDeleted" = false
  ```

- [ ] **Lines 75-83:** Interview stats JOIN
  ```diff
    FROM "Organization" o
    JOIN "Drive" d ON d."orgId" = o.id
    JOIN "Application" a ON a."driveId" = d.id
    JOIN "Interview" i ON i."applicationId" = a.id
  + WHERE o."isDeleted" = false AND d."isDeleted" = false AND a."isDeleted" = false AND i."isDeleted" = false
  ```

- [ ] **Lines 85-91:** Total interviews JOIN
  ```diff
    FROM "Organization" o
    JOIN "Drive" d ON d."orgId" = o.id
    JOIN "Application" a ON a."driveId" = d.id
    JOIN "Interview" i ON i."applicationId" = a.id
  + WHERE o."isDeleted" = false AND d."isDeleted" = false AND a."isDeleted" = false AND i."isDeleted" = false
  ```

- [ ] **Lines 101-140:** Recent activity UNION
  ```diff
    SELECT 'ORG'::text AS type, o.name AS detail, ''::text AS org, o."createdAt" AS at
    FROM "Organization" o
  + WHERE o."isDeleted" = false
    ORDER BY o."createdAt" DESC
    
    ...
    
    SELECT 'DRIVE'::text AS type, d.title AS detail, COALESCE(o.name, '')::text AS org, d."createdAt" AS at
    FROM "Drive" d
  + WHERE d."isDeleted" = false
    
    ...
    
    SELECT 'CANDIDATE'::text AS type, a."fullName" AS detail, COALESCE(o.name, '')::text AS org, a."createdAt" AS at
    FROM "Application" a
  + WHERE a."isDeleted" = false
    
    ...
    
    SELECT 'INTERVIEW'::text AS type, 'Completed'::text AS detail, COALESCE(o.name, '')::text AS org, i."completedAt" AS at
    FROM "Interview" i
    JOIN "Application" a ON a.id = i."applicationId"
  + WHERE i."isDeleted" = false AND a."isDeleted" = false
  ```

- [ ] **Lines 152-159:** Trends queries
  ```diff
  - (SELECT COUNT(*)::INT FROM "Organization" WHERE "createdAt" >= ${lastWeek}) AS "orgsNew",
  + (SELECT COUNT(*)::INT FROM "Organization" WHERE "isDeleted" = false AND "createdAt" >= ${lastWeek}) AS "orgsNew",
  
  - (SELECT COUNT(*)::INT FROM "Drive" WHERE "createdAt" >= ${lastWeek}) AS "drivesNew",
  + (SELECT COUNT(*)::INT FROM "Drive" WHERE "isDeleted" = false AND "createdAt" >= ${lastWeek}) AS "drivesNew",
  
  - (SELECT COUNT(*)::INT FROM "Application" WHERE "createdAt" >= ${lastWeek}) AS "candidatesNew",
  + (SELECT COUNT(*)::INT FROM "Application" WHERE "isDeleted" = false AND "createdAt" >= ${lastWeek}) AS "candidatesNew",
  ```

---

### 🔴 PRIORITY 2: Admin Organization Stats

**File:** `app/api/admin/stats/route.ts`

- [ ] **Lines 37-55:** Application/Drive/Interview JOIN
  ```diff
    FROM "Application" a
    JOIN "Drive" d ON d.id = a."driveId"
    LEFT JOIN "Interview" i ON i."applicationId" = a.id
    WHERE d."orgId" = ${orgId}
  + AND a."isDeleted" = false AND d."isDeleted" = false AND i."isDeleted" = false
  ```

- [ ] **Lines 56-61:** Drive stats
  ```diff
  - FROM "Drive"
  + FROM "Drive" WHERE "isDeleted" = false
    WHERE "orgId" = ${orgId}
  ```

- [ ] **Lines 63-88:** Rating stats
  ```diff
    FROM "Interview" i
    JOIN "Application" a ON a.id = i."applicationId"
    JOIN "Drive" d ON d.id = a."driveId"
    WHERE d."orgId" = ${orgId}
  + AND i."isDeleted" = false AND a."isDeleted" = false AND d."isDeleted" = false
  ```

---

### 🔴 PRIORITY 3: Super-Admin Org Management

**File:** `app/api/super-admin/orgs/route.ts`

- [ ] **Lines 50-79:** Organization paginated query with subcounts
  ```diff
    SELECT 
        o.*,
  -     (SELECT COUNT(*)::INT FROM "User" u WHERE u."orgId" = o.id) as "adminCount",
  -     (SELECT COUNT(*)::INT FROM "Drive" d WHERE d."orgId" = o.id) as "driveCount",
  -     (SELECT COUNT(*)::INT FROM "Application" a JOIN "Drive" d ON d.id = a."driveId" WHERE d."orgId" = o.id) as "candidateCount",
  +     (SELECT COUNT(*)::INT FROM "User" u WHERE u."orgId" = o.id AND u."isDeleted" = false) as "adminCount",
  +     (SELECT COUNT(*)::INT FROM "Drive" d WHERE d."orgId" = o.id AND d."isDeleted" = false) as "driveCount",
  +     (SELECT COUNT(*)::INT FROM "Application" a JOIN "Drive" d ON d.id = a."driveId" WHERE d."orgId" = o.id AND a."isDeleted" = false AND d."isDeleted" = false) as "candidateCount",
  
  -     (SELECT COUNT(*)::INT FROM "Interview" i 
  -      JOIN "Application" a ON a.id = i."applicationId" 
  -      JOIN "Drive" d ON d.id = a."driveId" 
  -      WHERE d."orgId" = o.id) as "interviewCount",
  +     (SELECT COUNT(*)::INT FROM "Interview" i 
  +      JOIN "Application" a ON a.id = i."applicationId" 
  +      JOIN "Drive" d ON d.id = a."driveId" 
  +      WHERE d."orgId" = o.id AND i."isDeleted" = false AND a."isDeleted" = false AND d."isDeleted" = false) as "interviewCount",
  ```

- [ ] **Lines 99-119:** Total counts query
  ```diff
  - (SELECT COUNT(*)::INT FROM "User") as "totalAdmins",
  - (SELECT COUNT(*)::INT FROM "Drive") as "totalDrives",
  - (SELECT COUNT(*)::INT FROM "Application") as "totalCandidates",
  + (SELECT COUNT(*)::INT FROM "User" WHERE "isDeleted" = false) as "totalAdmins",
  + (SELECT COUNT(*)::INT FROM "Drive" WHERE "isDeleted" = false) as "totalDrives",
  + (SELECT COUNT(*)::INT FROM "Application" WHERE "isDeleted" = false) as "totalCandidates",
  
  - (SELECT COUNT(*)::INT FROM "Interview" WHERE "status" = 'COMPLETED') as "totalInterviewed",
  + (SELECT COUNT(*)::INT FROM "Interview" WHERE "isDeleted" = false AND "status" = 'COMPLETED') as "totalInterviewed",
  ```

- [ ] **Lines 120-127:** Credit stats
  ```diff
    FROM "Organization" o
    ORDER BY "creditsUsed" DESC
  + WHERE o."isDeleted" = false
  ```

- [ ] **Lines 128-137:** Interview stats JOIN
  ```diff
    FROM "Organization" o
    JOIN "Drive" d ON d."orgId" = o.id
    JOIN "Application" a ON a."driveId" = d.id
    JOIN "Interview" i ON i."applicationId" = a.id
  + WHERE o."isDeleted" = false AND d."isDeleted" = false AND a."isDeleted" = false AND i."isDeleted" = false
  ```

- [ ] **Lines 138-177:** Recent activity UNION (same as super-admin/stats)
  All UNION subqueries need soft-delete filters

- [ ] **Lines 178-197:** Trends query
  ```diff
  - (SELECT COUNT(*)::INT FROM "Organization" WHERE "createdAt" >= ${lastWeek}) as "orgsNew",
  + (SELECT COUNT(*)::INT FROM "Organization" WHERE "isDeleted" = false AND "createdAt" >= ${lastWeek}) as "orgsNew",
  
  - (SELECT COUNT(*)::INT FROM "User" WHERE "createdAt" >= ${lastWeek}) as "adminsNew",
  + (SELECT COUNT(*)::INT FROM "User" WHERE "isDeleted" = false AND "createdAt" >= ${lastWeek}) as "adminsNew",
  
  - (SELECT COUNT(*)::INT FROM "Drive" WHERE "createdAt" >= ${lastWeek}) as "drivesNew",
  + (SELECT COUNT(*)::INT FROM "Drive" WHERE "isDeleted" = false AND "createdAt" >= ${lastWeek}) as "drivesNew",
  
  - (SELECT COUNT(*)::INT FROM "Application" WHERE "createdAt" >= ${lastWeek}) as "candidatesNew",
  + (SELECT COUNT(*)::INT FROM "Application" WHERE "isDeleted" = false AND "createdAt" >= ${lastWeek}) as "candidatesNew",
  ```

---

### 🔴 PRIORITY 4: Billing/Credits Module

**File:** `lib/credits.ts`

- [ ] **Lines 40-54:** `getOrgBillingStatus()`
  ```diff
  - FROM "Organization"
  - WHERE id = ${orgId}
  + FROM "Organization"
  + WHERE id = ${orgId} AND "isDeleted" = false
  ```

- [ ] **Lines 71-83:** `syncOrgStatusWithInterviewQuota()`
  ```diff
  - FROM "Organization"
  - WHERE id = ${orgId}
  + FROM "Organization"
  + WHERE id = ${orgId} AND "isDeleted" = false
  ```

- [ ] **Lines 124-135:** `getEffectiveOrgStatus()`
  ```diff
  - FROM "Organization"
  - WHERE id = ${orgId}
  + FROM "Organization"
  + WHERE id = ${orgId} AND "isDeleted" = false
  ```

---

### 🟠 PRIORITY 5: Other Admin Endpoints

**File:** `app/api/admin/organization/route.ts`

- [ ] Find lines with Drive/Interview subcounts and add soft-delete filters

**File:** `app/api/super-admin/orgs/interview-history/route.ts`

- [ ] Find all Interview/Application/Drive queries and add filters

**File:** `app/api/admin/score-distribution/route.ts`

- [ ] Find all Interview/Application/Drive queries and add filters

---

## Testing Checklist

After each fix, verify:

- [ ] **Unit Test:** Create deleted org, verify not in count
- [ ] **Integration Test:** Dashboard data excludes deleted records
- [ ] **Query Verification:** Run raw SQL directly, confirm `isDeleted = false` clause works
- [ ] **Stats Consistency:** Compare ORM results with raw SQL results (should match)

### Example Test
```typescript
// Test soft-delete filtering
const org = await prisma.organization.create({
  data: { name: "Test", slug: "test-org" }
});

// Get initial count
const beforeCount = await prisma.organization.count();

// Soft-delete the org
await prisma.organization.update({
  where: { id: org.id },
  data: { isDeleted: true }
});

// Count should decrease
const afterCount = await prisma.organization.count();
expect(afterCount).toBe(beforeCount - 1);

// Stats API should not include deleted org
const stats = await GET();
expect(stats.totalOrgs).toBeLessThan(beforeCount);
```

---

## Completion Status

| File | Status | Notes |
|------|--------|-------|
| `app/api/super-admin/stats/route.ts` | ⬜ TODO | 8 separate fixes needed |
| `app/api/admin/stats/route.ts` | ⬜ TODO | 3 separate fixes needed |
| `app/api/super-admin/orgs/route.ts` | ⬜ TODO | 6 separate fixes needed |
| `lib/credits.ts` | ⬜ TODO | 3 function fixes needed |
| `app/api/admin/organization/route.ts` | ⬜ TODO | TBD based on file content |
| `app/api/super-admin/orgs/interview-history/route.ts` | ⬜ TODO | TBD based on file content |
| `app/api/admin/score-distribution/route.ts` | ⬜ TODO | TBD based on file content |

**Total Fixes Needed:** ~25-30 WHERE clause additions across 7 files

---

## Notes

- All changes are backward compatible (just adding AND conditions)
- No API contract changes needed
- No data migration required (isDeleted already exists)
- Test coverage will verify correctness
