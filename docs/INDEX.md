# HR Automation Platform: Technical Documentation Index

Welcome to the comprehensive developer guide for the Lumoscale HR Automation Platform. This suite of documentation is designed to help new engineers understand the end-to-end flow, tech stack, and AI-driven logic of the system.

## 🚀 Platform Architecture Overview
Our platform is built on a modern, asynchronous architecture using **Next.js**, **BullMQ**, **Redis**, and **OpenAI**. It is designed to handle thousands of applications while maintaining real-time integrity through a sophisticated proctoring suite.

## 📂 Documentation Modules (The 8 Phases)

Explore each phase of the recruitment lifecycle in detail:

1.  **[Phase 1: Recruitment Drive Creation](./01_create_drive.md)**
    *   Admin setup, AI JD extraction, and interview configuration.
2.  **[Phase 2: Job Link & Board Posting](./02_job_sharing.md)**
    *   Dynamic link generation and the candidate landing portal.
3.  **[Phase 3: Candidate Application & AI Resume Extraction](./03_candidate_application.md)**
    *   The candidate experience: multi-step forms and AI-powered auto-fill.
4.  **[Phase 4: AI Screening & Scoring Engine](./04_ai_screening.md)**
    *   Asynchronous background processing, BullMQ, and OpenAI scoring.
5.  **[Phase 5: Automated Communication](./05_automated_communication.md)**
    *   Automated status emails and secure interview link delivery.
6.  **[Phase 6: AI Interview Session Orchestration](./06_interview_session.md)**
    *   Dynamic interview setup, prompt prep, and candidate-specific context.
7.  **[Phase 7: Interview Proctoring & Integrity Suite](./07_proctoring_execution.md)**
    *   Fullscreen interview environment with real-time monitoring.
8.  **[Phase 8: AI Review & Comprehensive Reporting](./08_grading_reporting.md)**
    *   Structured AI analysis and final hiring reporting.

## 🛠 Core Internal Tools
- **Worker System**: Managed in `worker.ts`, handling all heavy lifting from scoring to grading.
- **AI Engine**: A hybrid Node.js/Python setup using `OpenAI GPT-4o` for deep semantic analysis.
- **Integrity Layer**: Real-time behavioral tracking using MediaPipe and TensorFlow.js in the browser.

---
*For any questions regarding specific implementation details, please refer to the "Related Code (File Map)" section at the end of each module.*
