# Phase 3: Candidate Application & AI Resume Extraction

This module handles the candidate-facing application process, including a multi-step form and AI-driven data extraction from resumes.

## 1. How this works
The **Candidate Application** module provides a seamless, AI-enhanced experience for job seekers. Instead of manually typing every detail, candidates can upload their resumes. The system then uses AI to extract key info (Name, Email, Experience, etc.) and pre-fill the application form, significantly reducing friction.

## 2. Technical Flow
1. **Resume Upload**: Candidate uploads a resume (PDF/Docx) on Step 1.
2. **AI Extraction**:
   - The UI calls `POST /api/extract` with the type set to `RESUME`.
   - The backend Python engine (`extract_pdf.py`) parses the document and uses `OpenAI GPT-4o` to identify personal and professional details.
3. **Form Auto-fill**: Extracted details are mapped back to the React state and populate the form fields in real-time.
4. **Multi-Step Submission**:
   - **Step 1**: Personal Info (Auto-filled).
   - **Step 2**: Professional Details (Experience, Notice Period, CTC).
   - **Step 3**: Final Review & Submission.
5. **Persistence & Storage**: 
   - The resume file is uploaded to **Supabase/Cloudflare R2** via `/api/extract`.
   - The application record is created in the database via `POST /api/candidates`, initially set to `Pending` status.

## 3. Tech Stack
- **Frontend**: Next.js (Client Components), Framer Motion (for step transitions - assumed from UI feel).
- **Backend APIs**: Next.js Route Handlers.
- **Storage**: Supabase Storage / Cloudflare R2 for resume hosting.
- **AI Engine**: OpenAI `GPT-4o` for structured extraction.

## 4. Tools & Open-Source Models
- **AI Extraction**: OpenAI `GPT-4o`.
- **Document Parsing**: `PyMuPDF4LLM` + `pdfplumber` (Python).
- **File Uploads**: Supabase SDK for persistent storage.

## 5. Related Code (File Map)
- **UI / Frontend**:
  - `app/careers/apply/[id]/page.tsx` [Line 24-159] - Application form controller and AI extraction trigger.
  - `components/application/personal-info.tsx` - UI for Personal details and resume upload.
  - `components/application/professional-details.tsx` - UI for experience and compensation details.
  - `components/application/resume-review.tsx` - Final step for reviewing extracted text.
- **Backend / APIs**:
  - `app/api/extract/route.ts` [Line 64-98] - Logic for uploading resumes to storage and returning public URLs.
  - `app/api/candidates/route.ts` [Line 46-125] - API for creating the initial application and triggering the AI screening queue.
- **Data Model**:
  - `prisma/schema.prisma` [Line 53-70] - `Application` model definition.
