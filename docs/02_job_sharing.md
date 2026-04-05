# Phase 2: Job Link Generation & Board Posting

This module handles the generation of unique, shareable recruitment links and the initial entry point for candidates.

## 1. How this works
Once a Recruitment Drive is published (marked as `ACTIVE`), the system generates a unique URL. This URL is the "Source of Truth" for the job opening. HR can copy this link and distribute it across various platforms (LinkedIn, Indeed, WhatsApp, etc.). When a candidate clicks the link, they are directed to a high-fidelity job landing page.

## 2. Technical Flow
1. **Link Generation**:
   - In the frontend, the link is constructed using the `window.location.origin` and the newly created `drive.id`.
   - Format: `https://[domain]/careers/jobs/[id]`
2. **Dynamic Routing**:
   - Next.js uses dynamic segment `[id]` to capture the Drive ID from the URL.
3. **Data Retrieval**:
   - The landing page calls the backend API `GET /api/drives/[id]` to fetch job details (Title, Description, Requirements).
4. **Candidate Redirection**:
   - From the landing page, candidates can click "Apply Now", which routes them to the application form: `/careers/apply/[id]`.

## 3. Tech Stack
- **Frontend**: Next.js (App Router), Lucide React (Icons).
- **Backend APIs**: Next.js Route Handlers (Dynamic API Routes).
- **Database**: PostgreSQL (via Prisma).

## 4. Tools & Open-Source Models
- **Clipboard API**: Used in the Admin dashboard for one-click link copying.
- **Next.js Dynamic Routing**: Core mechanism for handling unique job IDs.

## 5. Related Code (File Map)
- **UI / Frontend**:
  - `app/admin/create-drive/page.tsx` [Line 259-264, 286-304] - Link generation and copy-to-clipboard logic.
  - `app/careers/jobs/[id]/page.tsx` [Line 8-266] - Candidate landing page (Job details display).
- **Backend / APIs**:
  - `app/api/drives/[id]/route.ts` [Line 5-35] - API for fetching a single drive's details.
- **Data Model**:
  - `prisma/schema.prisma` [Line 23-51] - `Drive` model representing the job entity.
