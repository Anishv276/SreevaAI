# Phase 8: AI Grading, Proctoring Audit & HR Review

This module represents the final decision-making layer, where AI-generated evaluations and proctoring data are presented to HR for the final hiring verdict.

## 1. How this works
After the background worker completes the grading, the **HR Review** dashboard provides a comprehensive "Candidate Dossier". This unified view consolidates the resume analysis, a 7-zone technical assessment report, and a detailed proctoring audit (Integrity Dossier). HR can review every answer, check code submissions, and investigate security flags before scheduling an interview or making a hire.

## 2. Technical Flow
1. **Background Completion**: The `gradingWorker` (`worker.ts`) saves the final `aiReport` and updates the application status.
2. **HR Dashboard Access**:
   - HR navigates to `app/admin/candidates/[id]`.
   - The page fetches combined data from `/api/candidates/[id]`, including the drive info, application status, and assessment results.
3. **Multi-Tab Review**:
   - **Tab 1: Resume Analysis**: Displays the initial AI screening score and "Why Shortlisted" reasoning.
   - **Tab 2: Assessment Report**: A "Premium Dossier" visualizing the 7 AI evaluation zones (Hero Verdict, Narrative, Skill Matrix, etc.).
   - **Tab 3: Proctoring Audit**: Displays the **Trust Index (%)** and a chronological "Incident Chronicle" of all security flags.
4. **Deep Dive Submission Review**:
   - HR can click "View Answers" to access a question-by-question breakdown.
   - For coding questions, the system provides a syntax-highlighted code viewer to inspect the candidate's implementation.

## 3. Tech Stack
- **Frontend**: Next.js (Client Components), Tailwind CSS, Lucide React (Icons).
- **AI Model**: OpenAI `gpt-4o-mini` (Grading) and `gpt-4o` (Initial Screening).
- **Data Visualization**: Custom SVG Score Rings and CSS-based progress bars.
- **Backend APIs**: Next.js Route Handlers.

## 4. Tools & Open-Source Models
- **Lucide React**: For semantic status icons (ShieldCheck, Sparkles, AlertTriangle).
- **Dicebear API**: For generating candidate avatars based on initials.

## 5. Related Code (File Map)
- **HR Review Dashboard**:
  - `app/admin/candidates/[id]/page.tsx` [Line 271-800] - Complex multi-tab UI for AI reports and proctoring audits.
- **Proctoring Incident Chronicle**:
  - `app/admin/candidates/[id]/page.tsx` [Line 624-799] - Logic for calculating Trust Index and rendering the event timeline.
- **Submission Review Page**:
  - `app/admin/candidates/[id]/answers/page.tsx` [Line 88-196] - Detailed view of candidate answers and coding snippets.
- **Backend / APIs**:
  - `app/api/candidates/[id]/route.ts` - Primary API providing the consolidated dossier data.
- **Data Model**:
  - `prisma/schema.prisma` [Line 72-91] - `Assessment` model storing the `aiReport`.
  - `prisma/schema.prisma` [Line 93-103] - `ProctoringEvent` model storing the security logs.
