# 🛡️ SreevaAI Database Migration Guide

This guide explains how to safely update the database schema without losing production data.

---

## ❌ The Danger Zone: What NOT to do in Production

**Never run `npx prisma db push` against the live production database once you have real users.**

If you add a **required column** to a table that already has data, `db push` will throw a data loss error. If you bypass it with `--accept-data-loss` or `--force-reset`, **your entire production database will be wiped out.**

---

## ✅ The Golden Rule for Adding New Columns

If you need to add a new column to an existing table (e.g., `Application`), you **must** do one of two things to prevent Prisma from crashing:

### 1. Make the Column Optional (Recommended)
Add a `?` after the type. This allows older rows to simply have a `null` value for this column.
```prisma
// ❌ BAD: Will crash if data exists
candidateEmail String

// ✅ GOOD: Safe to add
candidateEmail String?
```

### 2. Provide a Default Value
If the column *must* be required, you must give Prisma a default value to fill into all the old rows.
```prisma
// ✅ GOOD: Safe to add
candidateEmail String @default("no-email@example.com")
```

---

## 🚀 The Safe Workflow for Updating Production

Follow these exact steps when you change your `schema.prisma` file to ensure AWS updates seamlessly.

### Step 1: Connect to Development
Ensure your local `.env` file is pointing to your **Testing / Development** database (NOT Production).

### Step 2: Generate a Migration
Instead of pushing directly, tell Prisma to write an SQL script for your changes:
```powershell
npx prisma migrate dev --name describe_your_changes_here
```
*This will create a new `.sql` file inside the `prisma/migrations/` folder.*

### Step 3: Push to GitHub
Commit the changes (including the new `prisma/migrations/` folder) and push to your `main` branch:
```powershell
git add .
git commit -m "Added new candidateEmail column"
git push origin main
```

### Step 4: AWS Takes Over
You are done! When your AWS server automatically pulls the code and rebuilds the Docker container, it runs this command in the background:
```bash
npx prisma migrate deploy
```
This command safely applies your new `.sql` file to the Production database without dropping any tables or losing any data!
