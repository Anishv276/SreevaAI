# Phase 8: AI Review, Interview Audit & HR Reporting

This module is the final decision layer where AI-generated resume analysis and interview data are presented to HR for the final hiring verdict.

## 1. How this works
After interview completion, the **HR Review** dashboard provides a consolidated candidate dossier. This view combines resume analysis, score breakdown, interview recording, transcript, and interview status timeline.

## 2. Technical Flow
1. **Background Completion**: Interview finalization updates recording URL, transcript, and completion status.
2. **HR Dashboard Access**:
   - HR opens `app/admin/candidates/[id]`.
   - The page fetches combined data from `/api/candidates/[id]`.
3. **Review Surface**:
   - Resume analysis and screening score.
   - Interview recording and transcript playback.
   - AI verdict sections (strengths, concerns, role-fit analysis).

## 3. Tech Stack
- **Frontend**: Next.js (Client Components), Tailwind CSS, Lucide React.
- **AI Model**: OpenAI `gpt-4o-mini` and `gpt-4o`.
- **Backend APIs**: Next.js Route Handlers.

## 4. Related Code (File Map)
- `app/admin/candidates/[id]/page.tsx` - Main HR candidate dossier view.
- `app/api/candidates/[id]/route.ts` - Consolidated candidate + interview API.
- `app/api/interview/recording/route.ts` - Recording upload persistence.
- `app/api/interview/finalize/route.ts` - Transcript/status finalization.
