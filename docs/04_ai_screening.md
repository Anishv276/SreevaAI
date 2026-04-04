# Phase 4: AI Screening & Scoring Engine

This module represents the "Intelligent Core" of the platform, where candidate data is asynchronously analyzed against job requirements to produce a compatibility score.

## 1. How this works
The **AI Screening & Scoring** phase is completely automated and runs in the background. Instead of forcing the candidate or recruiter to wait for a synchronous API response, the system offloads the heavy lifting to a distributed worker system. This ensures the application remains responsive even under high load.

## 2. Technical Flow
1. **Job Enqueuing**:
   - Immediately after a candidate submits their application (`POST /api/candidates`), a new job is added to the `resume-processing` queue via **BullMQ**.
2. **Worker Processing**:
   - The background worker (`worker.ts`) picks up the job.
   - If the resume text is not already provided, the worker downloads the PDF from storage and extracts the text via `extract_pdf.py`.
3. **AI Scoring**:
   - The worker executes the Python engine with the `SCORE` command.
   - It sends both the Job Description (JD) and the parsed Resume text to `OpenAI GPT-4o`.
   - The AI evaluates the alignment based on the weights (Skills, Experience, Education) defined during Drive creation.
4. **Decision Logic**:
   - The system receives a score (0-100) and a reasoning summary from the AI.
   - If the score meets or exceeds the `screeningThreshold` (configurable per drive, e.g., 70), the candidate's status is updated to `Shortlisted`.
   - Otherwise, the status is set to `Rejected`.
5. **Database Sync**:
   - The worker updates the `Application` record in PostgreSQL with the final score (`aiScore`) and the detailed report (`aiReport`).

## 3. Tech Stack
- **Architecture**: Asynchronous Distributed Workers.
- **Message Broker**: Redis (via IORedis).
- **Queue Management**: BullMQ.
- **Backend Logic**: Node.js (Worker) & Python (AI Engine).
- **Database**: PostgreSQL (via Prisma).

## 4. Tools & Open-Source Models
- **BullMQ**: For reliable job scheduling and retries.
- **Redis**: As the backing store for the queue.
- **OpenAI GPT-4o**: For high-fidelity semantic comparison between JD and Resume.

## 5. Related Code (File Map)
- **API (Trigger)**:
  - `app/api/candidates/route.ts` [Line 112-123] - Enqueuing the job into the `resumeQueue`.
- **Worker (Processing Logic)**:
  - `worker.ts` [Line 22-64] - `resume-processing` worker initialization and text extraction.
  - `worker.ts` [Line 67-100] - AI Scoring logic and Python engine execution.
  - `worker.ts` [Line 102-109] - Updating the candidate's score and status in the DB.
- **Scripts**:
  - `scripts/extract_pdf.py` - The core Python script that handles the `SCORE` command and OpenAI integration.
- **Queue Configuration**:
  - `lib/queue.ts` - BullMQ queue and Redis connection setup.
- **Data Model**:
  - `prisma/schema.prisma` [Line 53-70] - `Application` model with `aiScore` and `aiReport` fields.
