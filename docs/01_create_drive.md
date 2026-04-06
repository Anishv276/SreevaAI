# Phase 1: Recruitment Drive Creation

This module handles the administrative setup of a hiring drive, including role definition, AI-assisted Job Description (JD) processing, and assessment configuration.

## 1. How this works
The **Create Drive** module allows HR/Admins to define the parameters of a recruitment cycle. It uses a multi-step form to collect basic job info, extract key requirements from JD files using AI, and configure the difficulty and proctoring settings for the subsequent assessment phases.

## 2. Technical Flow
1. **Administrative Setup**: Admin enters basic job details (Role, Dept, Location).
2. **AI JD Extraction**:
   - Admin uploads a PDF/Docx Job Description.
   - The system triggers `/api/extract`, which saves the file temporarily and calls a Python script.
   - The Python script (`extract_pdf.py`) uses `PyMuPDF4LLM` for markdown-first extraction and `pdfplumber` for table-aware parsing before `OpenAI GPT-4o` structures the JD into skills, responsibilities, and experience.
3. **Screening Configuration**: AI screening is toggled, and weights (Skills vs. Experience vs. Education) are defined for the automated scoring engine.
4. **Assessment Strategy**: Admin selects the test mode (MCQ, Coding, or Hybrid) and sets time limits and proctoring strictness.
5. **Persistence**: On publish, the data is saved to the PostgreSQL database via Prisma, and a unique candidate portal link is generated.

## 3. Tech Stack
- **Frontend**: Next.js (App Router), Tailwind CSS.
- **Backend APIs**: Next.js Route Handlers.
- **Database**: PostgreSQL with Prisma ORM.
- **Icons**: Lucide React.
- **UI Components**: Shaden/ui (Custom components).

## 4. Tools & Open-Source Models
- **AI Extraction Engine**: OpenAI `GPT-4o` (via Python child process).
- **PDF Processing**: `PyMuPDF4LLM` + `pdfplumber` (Python libraries).
- **Storage**: Temporary local storage for initial JD processing.

## 5. Related Code (File Map)
- **UI / Frontend**:
  - `app/admin/create-drive/page.tsx` [Line 42-585] - Main form controller & step state management.
  - `components/create-drive/basic-info.tsx` - UI for Step 1: Basic Info.
  - `components/create-drive/job-description.tsx` - UI for Step 2: JD upload & AI extraction trigger.
  - `components/create-drive/screening-assessment.tsx` - UI for Step 3: AI screening weights configuration.
  - `components/create-drive/registration-form.tsx` - UI for Step 4: Custom registration fields.
- **Backend / Logic**:
  - `app/api/extract/route.ts` [Line 8-104] - Primary API for JD & Resume extraction.
  - `scripts/extract_pdf.py` - Core Python engine for PDF parsing and OpenAI structuring.
  - `app/api/drives/route.ts` - API handler for database persistence (POST) and retrieval (GET).
- **Data Model**:
  - `prisma/schema.prisma` [Line 23-51] - `Drive` model definition & relationships.
