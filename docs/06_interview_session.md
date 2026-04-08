# Phase 6: AI Interview Session Orchestration

This module handles real-time interview session preparation based on each candidate's background and the role's core requirements.

## 1. How this works
The orchestration layer ensures every interview session is contextual and role-specific. By comparing candidate resume claims against the Job Description, the AI prepares targeted areas to probe.

## 2. Technical Flow
1. **Trigger**: The background worker (`worker.ts`) runs after screening completes.
2. **Context Assembly**: The system combines `resumeText`, structured resume JSON, and extracted JD details.
3. **AI Prompting**:
   - Prompt templates are sent to `OpenAI GPT-4o`/`gpt-4o-mini`.
   - The output prioritizes high-value interview signals and follow-up depth.
4. **Session Handoff**:
   - The candidate receives an interview link.
   - LiveKit token generation and room dispatch are handled by interview APIs.

## 3. Tech Stack
- **AI Model**: OpenAI GPT-4o family.
- **Backend Logic**: TypeScript (`worker.ts`, `app/api/interview/*`).
- **Data Serialization**: JSON-based structured resume/JD payloads.

## 4. Tools & Open-Source Models
- **OpenAI JSON responses**: Used for consistent machine-readable scoring context.

## 5. Related Code (File Map)
- **Worker Integration**:
  - `worker.ts` - Screening, status update, and interview invite dispatch.
- **Interview APIs**:
  - `app/api/interview/token/route.ts` - LiveKit token creation and agent dispatch.
  - `app/api/interview/finalize/route.ts` - Final transcript/status persistence.
- **Data Model**:
  - `prisma/schema.prisma` - `Interview` model for session records.
