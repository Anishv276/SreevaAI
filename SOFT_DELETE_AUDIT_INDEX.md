# Soft-Delete Audit — Complete Documentation Index

## Overview

This folder contains a comprehensive audit of soft-delete filtering across the SreevaAI product. Critical issues were found in 7 API endpoints and 1 utility module where raw SQL queries bypass the Prisma middleware soft-delete filtering mechanism.

**Status:** CRITICAL (High severity) ⚠️  
**Date:** June 22, 2026  
**Action Required:** YES — Immediate fixes needed

---

## Documents in This Audit

### 1. **SOFT_DELETE_EXECUTIVE_SUMMARY.txt** ⭐ START HERE
   - **Purpose:** Quick overview for stakeholders
   - **Audience:** Project managers, tech leads, decision makers
   - **Read Time:** 5-10 minutes
   - **Contains:**
     - Issue overview and impact summary
     - Quick facts and statistics
     - Problem and solution patterns
     - Effort estimation
     - Verification approach

### 2. **SOFT_DELETE_ARCHITECTURE.txt**
   - **Purpose:** Technical deep-dive on how soft-delete works
   - **Audience:** Engineers implementing fixes
   - **Read Time:** 10-15 minutes
   - **Contains:**
     - Database and application layer diagrams
     - Middleware flow visualization
     - Affected query patterns with examples
     - Impact chain analysis
     - Solution architecture
     - Testing strategy
     - Prevention measures

### 3. **SOFT_DELETE_AUDIT_REPORT.md**
   - **Purpose:** Formal audit findings with detailed analysis
   - **Audience:** Code reviewers, tech leads
   - **Read Time:** 20-30 minutes
   - **Contains:**
     - Comprehensive findings for each file
     - Line-by-line issue mapping
     - Correct vs. incorrect implementations
     - Detailed impact assessment
     - Remediation steps
     - Testing strategy
     - Code examples showing fixes

### 4. **SOFT_DELETE_FIX_CHECKLIST.md** ⭐ FOR DEVELOPERS
   - **Purpose:** Step-by-step fix guide
   - **Audience:** Developers implementing the fixes
   - **Read Time:** 15-20 minutes
   - **Contains:**
     - Priority-ordered list of all files to fix
     - Line-by-line diff examples for each fix
     - Copy-paste ready SQL WHERE clauses
     - Testing checklist per fix
     - Completion status tracker

### 5. **SOFT_DELETE_AUDIT_INDEX.md** (THIS FILE)
   - **Purpose:** Navigation guide for all audit documents
   - **Audience:** Anyone needing to find information
   - **Contains:** This index with reading guide

---

## Quick Navigation

### I'm a...

#### Project Manager / Tech Lead
1. Read: **SOFT_DELETE_EXECUTIVE_SUMMARY.txt** (5 min)
2. Review: Impact and effort sections
3. Decision: Approve fixes + allocate resources

#### Developer Implementing Fixes
1. Read: **SOFT_DELETE_ARCHITECTURE.txt** (understand the problem)
2. Reference: **SOFT_DELETE_FIX_CHECKLIST.md** (line-by-line fixes)
3. Check: Completion status tracker as you go
4. Test: Follow testing checklist for each file

#### Code Reviewer
1. Read: **SOFT_DELETE_AUDIT_REPORT.md** (detailed findings)
2. Cross-check: Against **SOFT_DELETE_FIX_CHECKLIST.md** (verify fixes)
3. Verify: All WHERE clauses added to correct models
4. Test: Run test cases from testing section

#### Architect / Systems Designer
1. Read: **SOFT_DELETE_ARCHITECTURE.txt** (flow and patterns)
2. Review: Root cause analysis
3. Consider: Prevention measures and linting rules
4. Plan: Long-term architectural improvements

---

## Issue Summary

### The Problem in One Sentence
Raw SQL queries in 7 API endpoints don't filter out soft-deleted records, causing deleted organizations, drives, applications, and interviews to appear in statistics and dashboards.

### Root Cause
Prisma's soft-delete middleware only filters ORM operations (findMany, count, etc.) but NOT raw SQL queries (`$queryRaw`). Developers must manually add WHERE clauses to raw SQL queries.

### Files Affected (Priority Order)

**🔴 CRITICAL:**
1. `app/api/super-admin/stats/route.ts` (8 fixes)
2. `app/api/admin/stats/route.ts` (3 fixes)
3. `app/api/super-admin/orgs/route.ts` (6 fixes)
4. `lib/credits.ts` (3 fixes)

**🟠 HIGH:**
5. `app/api/admin/organization/route.ts`
6. `app/api/super-admin/orgs/interview-history/route.ts`
7. `app/api/admin/score-distribution/route.ts`

### Total Effort
- **Fixes Needed:** ~25-30 WHERE clause additions
- **Time Estimate:** 1-2 days
- **Complexity:** Low (additive changes)
- **Risk:** Low (safe to roll back)

---

## Key Findings

### What Works ✓
- Prisma ORM queries (findMany, findUnique, count, etc.)
- SuperAdmin raw SQL queries (correctly filtered)
- Worker jobs (all use ORM)

### What's Broken ✗
- Super-admin dashboard statistics (35+ missing filters)
- Organization admin statistics (10+ missing filters)
- Billing/credits module (3 missing filters)
- Recent activity feeds (multiple missing filters)
- Trend analysis (missing filters)
- Interview history (missing filters)
- Score distribution (missing filters)

### Impact
- Deleted organizations counted in statistics
- Deleted drives/applications/interviews appear in dashboards
- Billing calculations include deleted org data
- Recent activity shows deleted items
- Trend analysis is inaccurate
- Potential security/privacy issue

---

## Models with Soft-Delete

The following models have an `isDeleted` field in the schema:
```
Organization ← Query Issue (9+)
├─ User ← Query Issue (5+)
├─ Drive ← Query Issue (6+)
└─ Application ← Query Issue (7+)
   └─ Interview ← Query Issue (7+)

SuperAdmin ← NO Issue ✓
SupportTicket ← No issue in audited queries
EngineVoice ← No issue in audited queries
```

---

## The Fix Pattern

### Before (WRONG) ❌
```sql
SELECT COUNT(*)::INT FROM "Drive"
```

### After (CORRECT) ✓
```sql
SELECT COUNT(*)::INT FROM "Drive"
WHERE "isDeleted" = false
```

### For JOINs:
```sql
FROM "Organization" o
JOIN "Drive" d ON d."orgId" = o.id
JOIN "Application" a ON a."driveId" = d.id
WHERE o."isDeleted" = false
  AND d."isDeleted" = false
  AND a."isDeleted" = false
```

---

## Implementation Timeline

### Immediate (Today)
- [ ] Review audit documents
- [ ] Understand root cause
- [ ] Prioritize fixes (start with CRITICAL)

### This Week
- [ ] Implement fixes in priority order
- [ ] Add test cases
- [ ] Code review + approve
- [ ] Deploy to staging for verification

### Follow-up (Next Sprint)
- [ ] Add ESLint rules to prevent future issues
- [ ] Update CLAUDE.md with soft-delete patterns
- [ ] Update code review checklist
- [ ] Post-mortem and lessons learned

---

## Testing Strategy

### Basic Test (All Endpoints)
```
1. Create test data (org, drive, application, interview)
2. Record initial statistics
3. Soft-delete items (isDeleted = true)
4. Refresh statistics
5. Verify counts decreased by deleted items
```

### API Test
```
1. Call /api/super-admin/stats
2. Record totalOrgs, totalDrives, totalInterviews
3. Soft-delete items via admin panel
4. Call /api/super-admin/stats again
5. Verify counts match deleted items
```

### Dashboard Test
```
1. Load admin dashboard
2. Soft-delete some drives/applications
3. Refresh dashboard
4. Verify deleted items not visible
5. Verify counts updated
```

---

## Verification Checklist

### Before Merging
- [ ] All WHERE clauses added to raw SQL
- [ ] Tested with deleted records
- [ ] Statistics no longer include deleted items
- [ ] No API contract changes
- [ ] No breaking changes

### After Deploying
- [ ] Monitor dashboards for any anomalies
- [ ] Check stats consistency across environments
- [ ] Verify billing calculations are correct
- [ ] Confirm activity feeds don't show deleted items

---

## Prevention Going Forward

### Code Review
- Template question: "Does this query touch soft-delete models?"
- Require approval for raw SQL queries
- Check for WHERE "isDeleted" = false clause

### Testing
- Write tests for soft-delete filtering
- Use deleted records in test data
- Verify statistics exclude deleted items

### Documentation
- Update CLAUDE.md with soft-delete patterns
- Add code examples
- Create linting rules

### Linting
- ESLint rule: flag raw SQL without isDeleted check
- CI/CD check: reject PRs without proper filtering

---

## Document Cross-References

| Document | Covers | References |
|----------|--------|-----------|
| Executive Summary | High-level overview | CLAUDE.md, Audit Report |
| Architecture | Technical details | Prisma middleware, Schema |
| Audit Report | Detailed findings | Individual files, line numbers |
| Fix Checklist | Implementation steps | Exact diffs, code examples |
| Index (this) | Navigation | All documents |

---

## FAQ

### Q: Do I need to change the database schema?
**A:** No. The `isDeleted` field already exists. This is just about adding WHERE clauses to queries.

### Q: Will this break existing APIs?
**A:** No. The changes are additive. Fewer records will be returned, which is correct behavior.

### Q: How long will the fixes take?
**A:** 1-2 days for implementation + testing.

### Q: Is it safe to deploy?
**A:** Yes. Low risk, additive changes only. Can be rolled back immediately if needed.

### Q: What if I miss a query?
**A:** Follow the prevention strategy. Add linting rules to catch future issues. For now, refer to the checklist to ensure nothing is missed.

### Q: Do I need to migrate data?
**A:** No. Existing data is unaffected. The `isDeleted` field is already populated.

### Q: What about performance?
**A:** Adding WHERE clauses typically improves performance (fewer rows to process).

---

## Contact & Support

For questions on:
- **Audit findings:** Review SOFT_DELETE_AUDIT_REPORT.md
- **Implementation:** Reference SOFT_DELETE_FIX_CHECKLIST.md
- **Architecture:** Check SOFT_DELETE_ARCHITECTURE.txt
- **Quick overview:** See SOFT_DELETE_EXECUTIVE_SUMMARY.txt

---

## Document Metadata

| Item | Value |
|------|-------|
| Audit Date | June 22, 2026 |
| Auditor | Claude Code AI |
| Repository | SreevaAI HR Interview Platform |
| Branch | Interview-fixes-using-logs-and-transcript |
| Status | CRITICAL — Action Required |
| Files Audited | 326 TypeScript/Python files |
| Issues Found | 7 files with 35+ missing filters |
| Recommendation | Implement all Priority 1-2 fixes this week |

---

## Document Updates

When updating this audit, please:
1. Update this index with new sections
2. Add links to new documents
3. Update the document metadata
4. Add date of update and change summary

---

**Generated:** June 22, 2026  
**Last Updated:** June 22, 2026  
**Next Review:** After fixes are implemented
