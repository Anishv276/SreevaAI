# Phase 6: AI-Powered Dynamic Assessment Generation

This module handles the real-time creation of personalized interview questions based on the candidate's specific background and the job's core requirements.

## 1. How this works
The **Assessment Generation** module ensures that no two candidates receive the exact same test. By comparing the candidate's resume claims against the Job Description, the AI identifies specific "knowledge gaps" or "high-value skills" to probe. It generates a mix of multiple-choice, open-ended, and live coding challenges tailored to the role's difficulty level.

## 2. Technical Flow
1. **Trigger**: Triggered by the background worker (`worker.ts`) once a candidate is shortlisted.
2. **Context Assembly**: The system extracts the `resumeText` and `jdText` from the database.
3. **AI Prompting**: 
   - A sophisticated prompt is sent to `OpenAI GPT-4o`.
   - The prompt specifies the number of questions, difficulty (Entry/Medium/Expert), and allowed types (MCQ, MAQ, TEXT, CODING).
4. **Structured JSON Output**:
   - The AI returns a JSON object containing the questions.
   - For **Coding Challenges**, the AI also generates boilerplate `starterCode` and valid `testCases` (input/output pairs) for automated execution.
5. **Database Persistence**:
   - The generated questions are saved into the `AssessmentQuestion` table, linked to the candidate's `Assessment` record.

## 3. Tech Stack
- **AI Model**: OpenAI GPT-4o (Chat Completion API).
- **Backend Logic**: TypeScript (`lib/ai-assessment.ts`).
- **Data Serialization**: JSON-Schema (for strict response formatting).

## 4. Tools & Open-Source Models
- **GPT-4o JSON Mode**: Guarantees that the AI returns a valid, parsable JSON structure for the frontend.

## 5. Related Code (File Map)
- **Core Logic**:
  - `lib/ai-assessment.ts` [Line 16-114] - Main function orchestrating the OpenAI prompt and response handling.
- **Worker Integration**:
  - `worker.ts` [Line 118-125] - Calling the generator from the background worker.
- **Data Model**:
  - `prisma/schema.prisma` [Line 72-91] - `Assessment` model (Container for the session).
  - `prisma/schema.prisma` [Line 105-116] - `AssessmentQuestion` model (Stores the generated text, options, and code).
